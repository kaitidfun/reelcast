import os
import math
import asyncio
import logging
from celery import Celery
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models.models import Reel, Product
from app.services.ai_service import generate_captions
from app.services.video_generation_service import (
    generate_video,
    generate_with_kling26,
    generate_extended_kling26,
)
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
    target: str = "all", duration: int = 10, with_audio: bool = False,
):
    """
    Celery background task: orchestrate reel generation pipeline.

    Handles AI video generation (Kling 2.6), FFmpeg overlay, and caption generation.
    Supports partial regeneration (e.g., video only, caption only).

    Args:
        reel_id: UUID of reel being processed
        platform: Target social platform (ig/fb/tt/yt) for caption optimization
        overlay_position: Logo/product placement (top-left/right, bottom-left/right, center)
        target: Generation scope — "all" (full pipeline) | "video" (Kling only) |
                "caption" (Gemini only) | "upload" (uploaded video → overlay → captions)
        duration: Video length in seconds — snapped to 5 or 10 for Kling 2.6
        with_audio: Whether to request ambient audio generation from Kling
    """
    asyncio.run(_async_process_reel_generation(
        reel_id, platform, overlay_position, target, duration, with_audio
    ))


async def _async_process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", duration: int = 10, with_audio: bool = False,
):
    """
    Async implementation: AI generation + overlay + caption pipeline.

    Workflow:
        1. Load reel + product from DB; enrich prompt with product metadata (F2-URS02-SRS01)
        2. Generate video via Kling 2.6 Pro:
             ≤ 10s → single clip
             > 10s → multi-clip extend chain (clips chained via last-frame extraction)
           OR use uploaded video (target="upload")
        3. Apply FFmpeg overlay (product image + brand logo) (F2-URS05-SRS01)
           If with_audio=False: FFmpeg strips audio during overlay pass.
           If no overlay was applied: separate FFmpeg audio strip pass.
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
        # Build rich product context for caption generation (name + description)
        if product:
            product_info = f"Product: {product.product_name}"
            if product.description:
                product_info += f". {product.description}"
        else:
            product_info = ""

        # Resolve product image URL — used for TWO purposes:
        #   1. Passed to fal.ai LTX as the first frame (image-to-video mode)
        #      → guarantees the generated video shows the REAL product,
        #        not an AI-hallucinated version built only from text
        #   2. Used as fallback overlay watermark when no brand logo is set
        #
        # The Gemini prompt includes both scene description and camera/motion cues —
        # Kling 2.6 uses the image as the visual anchor and the prompt to guide
        # the animation direction (rotate, zoom, environment atmosphere).
        product_image_url: str | None = None
        if product and product.images:
            primary = next((img for img in product.images if img.is_primary), None)
            raw_key = (primary or product.images[0]).image_url
            # Presigned URL (1h) — valid for both fal.ai fetch and httpx overlay download
            product_image_url = get_presigned_url(raw_key) if raw_key else None

        # Resolve overlay URL for FFmpeg watermark (F2-URS05-SRS01)
        # Brand logo preferred; fall back to product image if no logo configured
        # DB stores R2 object keys — convert to full public URL for httpx download
        overlay_url: str | None = None
        if product:
            raw_logo = product.brand_logo_url
            if raw_logo:
                # Presigned URL (1h) so httpx overlay_service can download without public bucket
                overlay_url = get_presigned_url(raw_logo)
            elif product_image_url:
                overlay_url = product_image_url  # Already presigned above

        # Build the final video prompt for Kling 2.6 Pro (F2-URS02-SRS01).
        # Gemini-generated prompts already describe the scene visually in detail.
        # Only append the product name as a light anchor if not already present.
        # Avoid overloading — Kling responds best to concise, concrete descriptions.
        video_prompt = reel.prompt_text
        if product and product.product_name:
            name_lower = product.product_name.lower()
            prompt_lower = reel.prompt_text.lower()
            if name_lower not in prompt_lower:
                # Product name not in prompt — append it as context so LTX knows the subject
                video_prompt = f"{reel.prompt_text.rstrip('.')}. Product: {product.product_name}."

        # ── Step 1: Determine video source ──────────────────────────────────
        if target in ["all", "video"]:
            # Kling 2.6 generation — image-to-video when product image available,
            # text-to-video otherwise.
            #
            # WHY Kling image-to-video (when product_image_url is set):
            #   Kling 2.6 genuinely ANIMATES the product photo — it adds natural
            #   movement (rotation, camera drift, lighting effects) rather than just
            #   "wiggling" a pasted 2D image like LTX did.  The result looks like
            #   a real product shoot, not a slideshow.
            #
            # WHY text-to-video (when no product image):
            #   No reference frame available — fall back to scene description.
            final_video_url = await _run_kling_generation(
                prompt=video_prompt,
                image_url=product_image_url,  # None → text-to-video; URL → image-to-video
                duration=duration,
                with_audio=with_audio,
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
            # R2 object keys (not starting with "http") need a presigned URL so
            # overlay_service.download_to_temp() can fetch them without auth.
            # fal.ai CDN URLs (starting with "http") are directly downloadable.
            video_for_download = final_video_url
            if final_video_url and not final_video_url.startswith("http"):
                video_for_download = get_presigned_url(final_video_url)
                logger.info(f"[Worker] Resolved R2 key to presigned URL for overlay download")

            logger.info(f"[Worker] Applying overlay from: {overlay_url}")
            try:
                # apply_overlay returns an R2 object key on success, raises on failure.
                # When with_audio=False, FFmpeg uses -an to strip the audio track.
                overlaid_key = await apply_overlay(
                    video_url=video_for_download,
                    overlay_url=overlay_url,
                    position=overlay_position,
                    reel_id=reel_id,
                    with_audio=with_audio,
                )
                final_video_url = overlaid_key  # R2 key — frontend proxies via /api/upload/videos/{key}
                overlay_applied = True
            except Exception as overlay_err:
                # Graceful degradation: reel still works without overlay
                # Keep final_video_url as the original R2 key or fal.ai CDN URL
                logger.warning(f"[Worker] Overlay failed, keeping original video: {overlay_err}")

        # ── Step 2b: Audio strip fallback (no overlay ran, but user wants no audio)
        # When there's no product logo / image the overlay step is skipped entirely,
        # leaving any audio from Kling in the final video.  Run a dedicated FFmpeg
        # pass (vcodec copy + -an) to strip it without re-encoding.
        if not with_audio and not overlay_applied and final_video_url:
            video_for_strip = final_video_url
            if not final_video_url.startswith("http"):
                video_for_strip = get_presigned_url(final_video_url)
            try:
                stripped_key = await strip_audio_from_video(video_for_strip, reel_id)
                final_video_url = stripped_key
                logger.info(f"[Worker] Audio stripped (no overlay path)")
            except Exception as strip_err:
                logger.warning(f"[Worker] Audio strip failed, keeping original: {strip_err}")

        # ── Step 3: Generate Captions & Hashtags ─────────────────────────────
        if target in ["all", "caption", "upload"]:
            # Use the enriched video_prompt (includes product metadata) for richer captions.
            # Falls back to reel.prompt_text for upload/caption-only flows.
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
# Kling 2.6 Generation
# ─────────────────────────────────────────────────────────────────────────────

async def _run_kling_generation(
    prompt: str,
    image_url: str | None,
    duration: int,
    with_audio: bool = False,
    reel_id: str = "unknown",
) -> str:
    """
    Generate a product reel using Kling Video 2.6 Pro.

    Routes to single-clip or multi-clip extend chain based on duration:
        ≤ 10s  → generate_with_kling26()          (single API call, fastest)
        > 10s  → generate_extended_kling26()       (chained clips via last-frame)

    Extend chain pipeline (example 30s):
        Clip 1 (10s): product image → Kling 2.6 Pro
        Clip 2 (10s): last_frame(clip1) → Kling 2.6 Pro
        Clip 3 (10s): last_frame(clip2) → Kling 2.6 Pro
        → FFmpeg concat → R2 upload → object key returned

    Args:
        prompt:     Gemini-generated scene description with camera + motion cues
        image_url:  Presigned product image URL (None → text-to-video fallback)
        duration:   Requested seconds (5, 10, 15, 30, 60)
        with_audio: Passed through for downstream FFmpeg audio control
        reel_id:    Reel UUID — used for R2 key naming in multi-clip concat

    Returns:
        fal.media CDN URL  (single clip ≤ 10s)
        OR R2 object key   (multi-clip extend, proxied by /api/upload/videos/{key})
    """
    fal_key = os.getenv("FAL_KEY", "")

    # ── Fallback: no fal.ai key → use simple facade (Veo or sample) ──────────
    if not fal_key:
        logger.info("[Kling] No FAL_KEY, delegating to generate_video() facade")
        return await generate_video(prompt=prompt, image_url=image_url, duration=duration)

    mode = "image-to-video" if image_url else "text-to-video"

    if duration <= 10:
        # ── Single clip (fastest path) ────────────────────────────────────────
        logger.info(f"[Kling] Single clip {mode} ({duration}s, audio={with_audio})")
        video_url = await generate_with_kling26(
            prompt=prompt,
            image_url=image_url,
            duration=duration,
            with_audio=with_audio,
        )
    else:
        # ── Multi-clip extend chain ────────────────────────────────────────────
        num_clips = math.ceil(duration / 10)
        logger.info(
            f"[Kling] Extended {mode}: {duration}s = {num_clips} clips "
            f"(audio={with_audio})"
        )
        video_url = await generate_extended_kling26(
            prompt=prompt,
            image_url=image_url,
            total_duration=duration,
            with_audio=with_audio,
            reel_id=reel_id,
        )

    logger.info(f"[Kling] Done: {video_url}")
    return video_url
