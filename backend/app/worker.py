import os
import asyncio
import logging
from celery import Celery
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models.models import Reel, Product
from app.services.ai_service import generate_captions
from app.services.video_generation_service import generate_video, generate_with_ltx
from app.services.overlay_service import apply_overlay, strip_audio_from_video
from app.services.reel_service import update_reel
from app.services.storage_service import get_presigned_url

logger = logging.getLogger(__name__)

celery_app = Celery(
    "worker",
    broker=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
)

celery_app.conf.task_routes = {
    "app.worker.process_reel_generation": "main-queue"
}


@celery_app.task(name="app.worker.process_reel_generation")
def process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", duration: int = 5, with_audio: bool = False,
):
    """
    Celery background task: orchestrate reel generation pipeline.

    Handles AI video generation (LTX Video 2.3), FFmpeg overlay, and caption generation.
    Supports partial regeneration (e.g., video only, caption only).

    Args:
        reel_id:          UUID of reel being processed
        platform:         Target social platform (ig/fb/tt/yt) for caption optimisation
        overlay_position: Logo/product placement (top-left/right, bottom-left/right, center)
        target:           Generation scope — "all" | "video" | "caption" | "upload"
        duration:         Video length in seconds — passed to LTX frame calculation
        with_audio:       If False, FFmpeg strips audio during overlay (or separate -an pass)
    """
    asyncio.run(_async_process_reel_generation(
        reel_id, platform, overlay_position, target, duration, with_audio
    ))


async def _async_process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", duration: int = 5, with_audio: bool = False,
):
    """
    Async implementation: AI generation + overlay + caption pipeline.

    Workflow:
        1. Load reel + product from DB; enrich prompt with product name (F2-URS02-SRS01)
        2. Generate video via LTX Video 2.3:
               With product image → image-to-video (product animates in scene)
               Without image      → text-to-video  (prompt-only generation)
           OR use uploaded video (target="upload")
        3. Apply FFmpeg overlay (product image / brand logo) (F2-URS05-SRS01)
           If with_audio=False: FFmpeg strips audio during the overlay pass.
           If no overlay ran:   Separate -an pass to strip audio if needed.
        4. Generate captions + hashtags with Gemini (F2-URS03)
        5. Persist all outputs to DB and mark reel Complete
    """
    db = SessionLocal()
    try:
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if not reel:
            logger.error(f"Reel {reel_id} not found in database")
            return

        update_reel(db, reel=reel, status="Generating")

        product = (
            db.query(Product)
            .options(joinedload(Product.images))
            .filter(Product.product_id == reel.product_id)
            .first()
        )

        # Build product context string for caption generation (name + description)
        if product:
            product_info = f"Product: {product.product_name}"
            if product.description:
                product_info += f". {product.description}"
        else:
            product_info = ""

        # Resolve primary product image URL for LTX image-to-video conditioning.
        # LTX receives the product photo directly — no Flux intermediate step needed.
        product_image_url: str | None = None

        if product and product.images:
            primary = next((img for img in product.images if img.is_primary), None)
            primary_img = primary or product.images[0]
            raw_key = primary_img.image_url
            # Presigned URL (1h) — accessible by fal.ai servers and httpx overlay download
            product_image_url = get_presigned_url(raw_key) if raw_key else None
            logger.info(
                f"[Worker] Product image resolved: {bool(product_image_url)} "
                f"(mode={'image-to-video' if product_image_url else 'text-to-video'})"
            )

        # Resolve overlay URL for FFmpeg watermark (F2-URS05-SRS01).
        # Brand logo preferred; falls back to product image if no logo configured.
        overlay_url: str | None = None
        if product:
            raw_logo = product.brand_logo_url
            if raw_logo:
                overlay_url = get_presigned_url(raw_logo)   # Presigned — overlay_service downloads it
            elif product_image_url:
                overlay_url = product_image_url              # Already presigned above

        # Build the final prompt for LTX Video (F2-URS02-SRS01).
        # Append product name only if not already present — avoids overloading the prompt.
        # LTX performs best with concise, motion-first prompts (200–350 chars ideal).
        video_prompt = reel.prompt_text
        if product and product.product_name:
            name_lower = product.product_name.lower()
            if name_lower not in reel.prompt_text.lower():
                # Light product anchor so LTX knows the subject (F2-URS02-SRS01)
                video_prompt = f"{reel.prompt_text.rstrip('.')}. Product: {product.product_name}."

        # ── Step 1: Determine video source ──────────────────────────────────
        if target in ["all", "video"]:
            # LTX Video 2.3: product image → image-to-video (or text-to-video if no image)
            final_video_url = await _run_ltx_generation(
                prompt=video_prompt,
                image_url=product_image_url,
                duration=duration,
                reel_id=reel_id,
            )
        elif target == "upload":
            # User-uploaded video — apply overlay + captions, skip AI generation
            final_video_url = reel.uploaded_video_url
        else:
            # Caption-only regeneration — retain existing video
            final_video_url = reel.final_commercial_video_url

        # ── Step 2: Apply FFmpeg overlay (brand logo / product image) ───────
        overlay_applied = False  # Track whether FFmpeg ran — needed for audio strip fallback
        if target in ["all", "video", "upload"] and overlay_url and final_video_url:
            # R2 object keys (not "http...") need presigning so overlay_service can download.
            # fal.ai CDN URLs (starting with "http") are directly accessible.
            video_for_download = final_video_url
            if not final_video_url.startswith("http"):
                video_for_download = get_presigned_url(final_video_url)
                logger.info("[Worker] Resolved R2 key → presigned URL for overlay download")

            logger.info(f"[Worker] Applying overlay at position '{overlay_position}'")
            try:
                overlaid_key = await apply_overlay(
                    video_url=video_for_download,
                    overlay_url=overlay_url,
                    position=overlay_position,
                    reel_id=reel_id,
                    with_audio=with_audio,
                )
                final_video_url = overlaid_key   # R2 key — frontend proxies via /api/upload/videos/{key}
                overlay_applied = True
            except Exception as overlay_err:
                # Graceful degradation: reel still works even if overlay fails
                logger.warning(f"[Worker] Overlay failed, keeping original video: {overlay_err}")

        # ── Step 2b: Audio strip fallback (no overlay ran, user wants no audio)
        # When no product logo/image exists the overlay step is skipped, leaving
        # any ambient audio in the video.  Run a dedicated FFmpeg -an pass to strip it.
        if not with_audio and not overlay_applied and final_video_url:
            video_for_strip = final_video_url
            if not final_video_url.startswith("http"):
                video_for_strip = get_presigned_url(final_video_url)
            try:
                stripped_key = await strip_audio_from_video(video_for_strip, reel_id)
                final_video_url = stripped_key
                logger.info("[Worker] Audio stripped (no-overlay path)")
            except Exception as strip_err:
                logger.warning(f"[Worker] Audio strip failed, keeping original: {strip_err}")

        # ── Step 3: Generate Captions & Hashtags ─────────────────────────────
        if target in ["all", "caption", "upload"]:
            caption_prompt = video_prompt if target in ["all", "video"] else reel.prompt_text
            ai_response = await generate_captions(
                prompt=caption_prompt,
                product_info=product_info,
                platform=platform,
            )
        else:
            ai_response = reel.caption_and_hashtags

        # ── Step 4: Persist completed reel ───────────────────────────────────
        update_reel(
            db,
            reel=reel,
            caption_and_hashtags=ai_response,
            final_commercial_video_url=final_video_url,
            status="Completed",
        )
        logger.info(f"Reel {reel_id} completed successfully")

    except Exception as e:
        logger.error(f"Error processing reel {reel_id}: {e}")
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if reel:
            update_reel(db, reel=reel, status="Failed", error_message=str(e))
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# LTX Video 2.3 Generation
# ─────────────────────────────────────────────────────────────────────────────

async def _run_ltx_generation(
    prompt: str,
    image_url: str | None,
    duration: int,
    reel_id: str = "unknown",
) -> str:
    """
    Generate a product reel using LTX Video 2.3 fast (fal-ai/ltx-video).

    Pipeline:
        With product image  → LTX image-to-video (photo anchors first frame)
        Without image       → LTX text-to-video   (prompt drives full scene)

    LTX generates a single clip up to ~10s in one API call (~30s wall time).
    No multi-clip chaining required — LTX natively supports longer sequences
    via num_frames up to 257 (~10.3s at 25fps).

    Args:
        prompt:    Scene description (from Gemini) — concise, motion-first format:
                   "Subject. Action. Camera movement. Lighting." (200–350 chars ideal)
        image_url: Primary product image URL (presigned R2 or fal.ai CDN).
                   Pass None for text-to-video mode.
        duration:  Requested seconds (snapped to LTX frame presets by generate_with_ltx)
        reel_id:   Reel UUID — used for logging / error context

    Returns:
        fal.media CDN URL of the generated video clip
    """
    fal_key = os.getenv("FAL_KEY", "")

    # Fallback: no fal.ai key → delegate to generate_video() facade (Veo or sample)
    if not fal_key:
        logger.info("[LTX] No FAL_KEY configured, delegating to generate_video() facade")
        return await generate_video(prompt=prompt, image_url=image_url, duration=duration)

    mode = "image-to-video" if image_url else "text-to-video"
    logger.info(f"[LTX] Starting {mode} generation for reel {reel_id} ({duration}s)")

    video_url = await generate_with_ltx(
        prompt=prompt,
        image_url=image_url,
        duration=duration,
    )

    logger.info(f"[LTX] Done for reel {reel_id}: {video_url}")
    return video_url
