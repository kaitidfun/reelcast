import os
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, Field

from app.dependencies import get_db, get_current_user
from app.models.models import User, Reel
from app.services.reel_service import create_reel, get_reel, update_reel
from app.services.upload_service import (
    validate_video_file,
    probe_video_duration,
    upload_video_to_r2,
)
from app.worker import process_reel_generation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reels", tags=["Reels"])


class ReelGenerateRequest(BaseModel):
    prompt_text: str = Field(..., max_length=500, description="Max 500 characters")
    product_id: UUID
    platform: Optional[str] = "ig"
    overlay_position: Optional[str] = "bottom-right"
    resolution: Optional[str] = "720p"
    duration: Optional[int] = 30

class ReelRegenerateRequest(BaseModel):
    target: str = Field(..., description="'video' or 'caption'")
    platform: Optional[str] = "ig"
    overlay_position: Optional[str] = "bottom-right"
    resolution: Optional[str] = "720p"
    duration: Optional[int] = 30

class ReelResponse(BaseModel):
    reel_id: UUID
    status: str
    prompt_text: str
    error_message: Optional[str] = None
    final_commercial_video_url: Optional[str] = None
    caption_and_hashtags: Optional[dict] = None

    class Config:
        from_attributes = True

@router.post("/generate", response_model=ReelResponse)
def trigger_generation(
    req: ReelGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    F2-URS01 & F2-URS02: Trigger reel generation via AI (Veo/fal.ai + Gemini).

    Creates a new Reel record and queues it for async processing (video generation,
    overlay, and caption generation via Celery).

    Request body includes:
        - prompt_text: User's creative brief (max 500 chars)
        - product_id: Selected product from library
        - platform: Target social platform (ig/fb/tt/yt)
        - overlay_position: Logo/product placement
        - resolution: Video quality (720p default)
        - duration: Video length in seconds (30s default)

    Returns:
        Reel object with status "Pending" → "Generating" → "Completed"
    """
    # Validation check
    if len(req.prompt_text) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt must be 500 characters or less.")

    # Create reel
    reel = create_reel(
        db=db, 
        user_id=current_user.user_id, 
        prompt_text=req.prompt_text, 
        product_id=req.product_id
    )
    
    # Send task to Celery
    process_reel_generation.delay(
        str(reel.reel_id), req.platform, req.overlay_position,
        resolution=req.resolution, duration=req.duration,
    )

    return reel

@router.get("/{reel_id}/status", response_model=ReelResponse)
def get_generation_status(
    reel_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    F2-URS06: Poll reel generation status (frontend calls every 3 seconds).

    Returns current state of reel including:
        - status: "Pending" | "Generating" | "Completed" | "Failed"
        - final_commercial_video_url: Generated video URL (when Completed)
        - caption_and_hashtags: Caption + 4 hashtags (when Completed)
        - error_message: If Failed, reason why

    Frontend uses this to update preview, show progress, and detect completion.
    """
    reel = get_reel(db=db, reel_id=reel_id, user_id=current_user.user_id)
    if not reel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reel not found")

    return reel

@router.post("/{reel_id}/regenerate", response_model=ReelResponse)
def trigger_regeneration(
    reel_id: UUID,
    req: ReelRegenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    F2-URS07: Regenerate reel content (video, caption, or both).

    Allows member to re-generate unsatisfactory outputs independently:
        - target='video': Re-run Veo/fal.ai with modified prompt
        - target='caption': Re-run Gemini for new captions/hashtags
        - target='all': Regenerate both

    Retains existing output until new generation completes, allowing comparison.
    Previous generations discarded from storage after member approves final version.
    """
    reel = get_reel(db=db, reel_id=reel_id, user_id=current_user.user_id)
    if not reel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reel not found")
    
    # Send task to Celery
    process_reel_generation.delay(
        str(reel.reel_id), req.platform, req.overlay_position, req.target,
        resolution=req.resolution, duration=req.duration,
    )

    return reel


@router.post("/upload-video", response_model=ReelResponse)
async def upload_reel_video(
    file: UploadFile = File(...),
    product_id: Optional[str] = Form(None),
    platform: str = Form("ig"),
    overlay_position: str = Form("bottom-right"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    F2-URS04: Accept member-uploaded video for processing (alternative to AI generation).

    Workflow:
        1. Validate file format (MP4/MOV/AVI only)
        2. Validate file size (max 500 MB per SRS)
        3. Validate duration via ffprobe (max 60 seconds per SRS)
        4. Upload to Cloudflare R2 cloud storage
        5. Create Reel record with uploaded_video_url
        6. Queue worker task for caption generation + FFmpeg overlay

    Unlike /generate, skips video generation (uses uploaded video as-is),
    but still applies product logo/image overlay and generates captions.
    """
    filename = file.filename or "video"

    # Step 1-3: Validate file format, size, and duration (consolidated in upload_service)
    file_data = await file.read()

    # Quick validation: format + size only (fail-fast before reading large file)
    errors = validate_video_file(filename, len(file_data))
    if errors:
        raise HTTPException(status_code=400, detail=errors[0])

    # Extended validation: duration check via ffprobe (runs after format/size pass)
    ext = os.path.splitext(filename)[1].lower()
    duration_sec = await probe_video_duration(file_data, ext)
    if duration_sec is not None and duration_sec > 60:
        raise HTTPException(status_code=400, detail=f"Video duration {duration_sec:.1f}s exceeds 60s limit")

    # Step 4: Upload to Cloudflare R2 (delegated to upload_service)
    try:
        video_url = await upload_video_to_r2(
            file_data=file_data,
            filename=filename,
            user_id=str(current_user.user_id),
        )
    except RuntimeError as e:
        logger.error(f"Video upload failed for user {current_user.user_id}: {e}")
        raise HTTPException(status_code=503, detail="Upload to storage service failed")

    # Step 5: Create Reel record with uploaded_video_url (F2-URS04-SRS04)
    parsed_product_id = None
    if product_id:
        try:
            parsed_product_id = UUID(product_id)
        except ValueError:
            logger.warning(f"Invalid product_id format: {product_id}")

    reel = create_reel(
        db=db,
        user_id=current_user.user_id,
        prompt_text="",  # No prompt for user-uploaded video
        product_id=parsed_product_id,
    )
    update_reel(db, reel=reel, uploaded_video_url=video_url)

    # Step 6: Queue caption generation + overlay (target="upload" for worker)
    process_reel_generation.delay(
        str(reel.reel_id), platform, overlay_position, "upload",
    )

    logger.info(f"Video upload completed for reel {reel.reel_id}, user {current_user.user_id}")
    return reel
