import os
import asyncio
import logging
from celery import Celery
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models.models import Reel, Product
from app.services.ai_service import generate_captions
from app.services.video_generation_service import (
    generate_video,
    generate_with_ltx23fast,
    extend_with_ltx_fast,
)
from app.services.overlay_service import apply_overlay
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
    target: str = "all", resolution: str = "720p", duration: int = 30,
):
    """
    Celery background task: orchestrate reel generation pipeline.

    Handles AI video generation (LTX hybrid), FFmpeg overlay, and caption generation.
    Supports partial regeneration (e.g., video only, caption only).

    Args:
        reel_id: UUID of reel being processed
        platform: Target social platform (ig/fb/tt/yt) for caption optimization
        overlay_position: Logo/product placement (top-left/right, bottom-left/right, center)
        target: Generation scope — "all" (full pipeline) | "video" (LTX only) |
                "caption" (Gemini only) | "upload" (uploaded video → overlay → captions)
        resolution: Video quality (720p default per SRS min requirement)
        duration: Video length in seconds (max 60 per SRS requirement)
    """
    asyncio.run(_async_process_reel_generation(
        reel_id, platform, overlay_position, target, resolution, duration
    ))


async def _async_process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", resolution: str = "720p", duration: int = 30,
):
    """
    Async implementation: AI generation + overlay + caption pipeline.

    Workflow:
        1. Load reel + product from DB; enrich prompt with product metadata (F2-URS02-SRS01)
        2. Generate video via LTX hybrid (≤20s=Pro; 30s=Pro+Extend; 60s=Pro+Extend+Extend)
           OR use uploaded video (target="upload")
        3. Apply FFmpeg overlay (product image + brand logo) (F2-URS05-SRS01)
        4. Generate captions + hashtags with Gemini (F2-URS03)
        5. Persist all outputs to DB and mark reel Complete

    Smart Retry: intermediate URL stored in reel.b_roll_url after each Pro/extend step
    so a re-queued task skips completed steps without re-charging the API.
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

        # Resolve product image URL for AI reference (F2-URS02-SRS01)
        # DB stores R2 object keys (relative paths) — convert to full public URL
        # so fal.ai can download the image for image-to-video mode
        product_image_url: str | None = None
        if product and product.images:
            primary = next((img for img in product.images if img.is_primary), None)
            raw_key = (primary or product.images[0]).image_url
            # Presigned URL (1h) so fal.ai can download the image without bucket being public
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

        # Build enriched prompt with product metadata for better AI relevance (F2-URS02-SRS01)
        video_prompt = reel.prompt_text
        if product:
            product_meta = f"Product: {product.product_name}"
            if product.description:
                product_meta += f" — {product.description}"
            video_prompt = f"{reel.prompt_text}. [{product_meta}]"

        # ── Step 1: Determine video source ──────────────────────────────────
        if target in ["all", "video"]:
            # Hybrid LTX generation (Pro + optional Fast extend based on duration)
            final_video_url = await _run_hybrid_generation(
                db=db,
                reel=reel,
                prompt=video_prompt,
                image_url=product_image_url,
                duration=duration,
            )
        elif target == "upload":
            # User-uploaded video — apply overlay + captions, skip AI generation
            final_video_url = reel.uploaded_video_url
        else:
            # Caption-only regeneration — retain existing video
            final_video_url = reel.final_commercial_video_url

        # ── Step 2: Apply FFmpeg overlay (brand logo / product image) ───────
        if target in ["all", "video", "upload"] and overlay_url and final_video_url:
            logger.info(f"[Worker] Applying overlay from: {overlay_url}")
            final_video_url = await apply_overlay(
                video_url=final_video_url,
                overlay_url=overlay_url,
                position=overlay_position,
                reel_id=reel_id,
            )

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
# Hybrid LTX Orchestration
# ─────────────────────────────────────────────────────────────────────────────

async def _run_hybrid_generation(
    db: Session,
    reel: Reel,
    prompt: str,
    image_url: str | None,
    duration: int,
) -> str:
    """
    Orchestrate LTX 2.3 Fast + extend based on requested duration.

    Hybrid strategy:
        ≤20s  → LTX 2.3 Fast only               (1 API call, direct generation)
        30s   → LTX 2.3 Fast(20s) → extend(10s) (2 API calls)
        60s   → LTX 2.3 Fast(20s) → extend × 2  (3 API calls, 20+20+20s)

    Smart retry via b_roll_url:
        After each successful API call the intermediate URL is saved to
        reel.b_roll_url so a retried Celery task can resume from the last
        completed step instead of restarting from the beginning.

    Args:
        db: Active SQLAlchemy session (for checkpoint saves)
        reel: Reel ORM instance (mutable — we update b_roll_url in-place)
        prompt: Enriched creative brief with product metadata
        image_url: Product image URL for fal.ai image-to-video reference (optional)
        duration: Requested video length in seconds

    Returns:
        Public CDN URL of the final (fully extended) video
    """
    fal_key = os.getenv("FAL_KEY", "")

    # ── Fallback: no fal.ai key → use simple facade (Veo or sample) ─────────
    if not fal_key:
        logger.info("[Hybrid] No FAL_KEY, delegating to generate_video() facade")
        return await generate_video(prompt=prompt, image_url=image_url, duration=duration)

    # ── Smart retry: resume from saved checkpoint if available ───────────────
    # b_roll_url stores the URL from the most recent successful API call.
    # A retried task resumes from the checkpoint instead of re-charging the API.
    intermediate_url: str | None = reel.b_roll_url

    # ── Step 1: LTX 2.3 Fast initial clip (up to 20s natively) ─────────────
    # LTX 2.3 Fast supports up to 20s per call via duration enum.
    # Short reels (≤20s) are done in a single call; longer reels chain LTX extend.
    base_clip_s = min(duration, 20)
    if not intermediate_url:
        logger.info(f"[Hybrid] Step 1 — LTX 2.3 Fast ({base_clip_s}s, image_ref={bool(image_url)})")
        intermediate_url = await generate_with_ltx23fast(
            prompt=prompt, image_url=image_url, duration=base_clip_s
        )
        # Checkpoint: save so a retry skips this API call
        update_reel(db, reel=reel, b_roll_url=intermediate_url)
        logger.info(f"[Hybrid] Step 1 done, checkpoint saved: {intermediate_url}")
    else:
        logger.info(f"[Hybrid] Step 1 skipped (checkpoint exists): {intermediate_url}")

    # Short reels (≤20s) — LTX 2.3 Fast clip is the final product
    if duration <= 20:
        return intermediate_url

    # ── Steps 2+: LTX 2.3 extend until target duration is reached ───────────
    # Each extend call adds up to 20s (we use 10s to stay well within the limit).
    # Strategy:
    #   30s → 1 extend of 10s  (20s base + 10s  = 30s,  2 API calls)
    #   60s → 2 extends of 20s (20s base + 20+20 = 60s,  3 API calls)
    _extend_plan: dict[int, list[float]] = {
        30: [10.0],
        60: [20.0, 20.0],
    }
    extend_durations = _extend_plan.get(duration, [10.0] * max(1, (duration - 20) // 10))

    current_url = intermediate_url
    for step, ext_s in enumerate(extend_durations, start=1):
        total_steps = len(extend_durations)
        logger.info(f"[Hybrid] Step {step + 1} — LTX extend +{ext_s}s ({step}/{total_steps})")
        current_url = await extend_with_ltx_fast(
            video_url=current_url, prompt=prompt, extend_seconds=ext_s
        )
        # Save checkpoint after each extend (except the last — that goes to final_commercial_video_url)
        if step < total_steps:
            update_reel(db, reel=reel, b_roll_url=current_url)
            logger.info(f"[Hybrid] Checkpoint updated after extend {step}: {current_url}")

    logger.info(f"[Hybrid] {duration}s reel complete: {current_url}")
    return current_url
