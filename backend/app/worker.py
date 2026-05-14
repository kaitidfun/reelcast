import os
import asyncio
from celery import Celery
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models.models import Reel, Product
from app.services.ai_service import generate_video, generate_captions
from app.services.media_service import apply_overlay
from app.services.reel_service import update_reel

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

    Handles AI video generation, FFmpeg overlay, and caption generation.
    Supports partial regeneration (e.g., video only, caption only).

    Args:
        reel_id: UUID of reel being processed
        platform: Target social platform (ig/fb/tt/yt) for caption optimization
        overlay_position: Logo/product placement (top-left/right, bottom-left/right, center)
        target: Generation scope — "all" (full pipeline) | "video" (Veo/fal only) |
                "caption" (Gemini only) | "upload" (uploaded video → overlay → captions)
        resolution: Video quality (720p default per SRS min requirement)
        duration: Video length in seconds (max 60 per SRS requirement)
    """
    asyncio.run(_async_process_reel_generation(reel_id, platform, overlay_position, target, resolution, duration))

async def _async_process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", resolution: str = "720p", duration: int = 30,
):
    """
    Async implementation: AI generation + overlay + caption pipeline.

    Workflow:
        1. Enrich user prompt with product metadata (F2-URS02-SRS01)
        2. Generate video (Veo/fal.ai) OR use uploaded video
        3. Apply FFmpeg overlay (product image + brand logo)
        4. Generate captions + hashtags (Gemini)
        5. Update reel record with all outputs, mark Complete

    Partial regeneration: target='caption' skips video gen, target='video' skips captions.
    """
    db = SessionLocal()
    try:
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if not reel:
            print(f"Reel {reel_id} not found.")
            return

        update_reel(db, reel=reel, status="Generating")

        product = (
            db.query(Product)
            .options(joinedload(Product.images))
            .filter(Product.product_id == reel.product_id)
            .first()
        )
        product_info = product.description if product else ""

        # Resolve overlay image URL (brand logo → primary image → first image)
        overlay_url: str | None = None
        if product:
            overlay_url = product.brand_logo_url
            if not overlay_url and product.images:
                primary = next((img for img in product.images if img.is_primary), None)
                overlay_url = (primary or product.images[0]).image_url

        # Build enriched prompt that includes product metadata (F2-URS02-SRS01)
        video_prompt = reel.prompt_text
        if product:
            product_meta = f"Product: {product.product_name}"
            if product.description:
                product_meta += f" — {product.description}"
            video_prompt = f"{reel.prompt_text}. [{product_meta}]"

        # 1. Determine video source
        if target in ["all", "video"]:
            # Generate new AI video
            final_video_url = await generate_video(
                prompt=video_prompt, resolution=resolution, duration=duration
            )
        elif target == "upload":
            # User-uploaded video — use as-is, then apply overlay + captions
            final_video_url = reel.uploaded_video_url
        else:
            # Regenerating caption only — keep existing video
            final_video_url = reel.final_commercial_video_url

        # 2. Apply FFmpeg overlay (product image / brand logo)
        if target in ["all", "video", "upload"] and overlay_url and final_video_url:
            print(f"[Worker] Applying overlay from: {overlay_url}")
            final_video_url = await apply_overlay(
                video_url=final_video_url,
                overlay_url=overlay_url,
                position=overlay_position,
                reel_id=reel_id,
            )

        # 3. Generate Captions & Hashtags
        if target in ["all", "caption", "upload"]:
            ai_response = await generate_captions(prompt=reel.prompt_text, product_info=product_info, platform=platform)
        else:
            ai_response = reel.caption_and_hashtags

        # Update reel
        update_reel(
            db,
            reel=reel,
            caption_and_hashtags=ai_response,
            final_commercial_video_url=final_video_url,
            status="Completed"
        )
        print(f"Reel {reel_id} completed successfully.")

    except Exception as e:
        print(f"Error processing reel {reel_id}: {e}")
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if reel:
            update_reel(db, reel=reel, status="Failed", error_message=str(e))
    finally:
        db.close()
