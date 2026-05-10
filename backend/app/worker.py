import os
import asyncio
from celery import Celery

from app.database import SessionLocal
from app.models.models import Reel, Product
from app.services.ai_service import generate_video, generate_captions
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
def process_reel_generation(reel_id: str, platform: str, overlay_position: str):
    """
    Background worker task to handle AI generation and media processing.
    """
    asyncio.run(_async_process_reel_generation(reel_id, platform, overlay_position))

async def _async_process_reel_generation(reel_id: str, platform: str, overlay_position: str):
    db = SessionLocal()
    try:
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if not reel:
            print(f"Reel {reel_id} not found.")
            return

        update_reel(db, reel=reel, status="Generating")

        product = db.query(Product).filter(Product.product_id == reel.product_id).first()
        product_info = product.description if product else ""
        
        # 1. Generate Video
        video_url = await generate_video(prompt=reel.prompt_text)
        
        # 2. Generate Captions & Hashtags
        ai_response = await generate_captions(prompt=reel.prompt_text, product_info=product_info, platform=platform)
        
        # 3. Media Processing (Skip real overlay if files are not local, but return video_url)
        final_video_url = video_url
        
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
