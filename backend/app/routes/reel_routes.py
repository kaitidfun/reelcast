import os
import asyncio
import tempfile

import ffmpeg as ff
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, Field

from app.dependencies import get_db, get_current_user
from app.models.models import User, Reel, Product
from app.services.reel_service import create_reel, get_reel, update_reel
from app.worker import process_reel_generation

router = APIRouter(prefix="/api/reels", tags=["Reels"])

_ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".avi"}
_MAX_VIDEO_BYTES   = 500 * 1024 * 1024  # 500 MB


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
    # 1. Validate file format (F2-URS04-SRS01)
    filename = file.filename or "video"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in _ALLOWED_VIDEO_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(sorted(_ALLOWED_VIDEO_EXT))}",
        )

    # 2. Read file + size check (F2-URS04-SRS01: max 500 MB)
    data = await file.read()
    if len(data) > _MAX_VIDEO_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 500 MB limit.")

    # 3. Duration check via ffprobe (F2-URS04-SRS01: max 60 s)
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=ext)
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)

        loop = asyncio.get_event_loop()
        probe = await loop.run_in_executor(None, ff.probe, tmp_path)
        duration_sec = float(probe.get("format", {}).get("duration", 0))
        if duration_sec > 60:
            raise HTTPException(status_code=400, detail="Video must be 60 seconds or shorter.")
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[Upload] ffprobe failed (skipping duration check): {exc}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    # 4. Upload to Cloudflare R2
    import uuid as _uuid
    import boto3

    r2_endpoint = os.getenv("R2_ENDPOINT_URL")
    r2_key_id   = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret   = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket   = os.getenv("R2_BUCKET_NAME")
    r2_public   = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

    if not all([r2_endpoint, r2_key_id, r2_secret, r2_bucket]):
        raise HTTPException(status_code=503, detail="Storage not configured on this server.")

    object_key = f"videos/reels/uploads/{current_user.user_id}/{_uuid.uuid4().hex}{ext}"
    content_type_map = {".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo"}

    def _r2_put():
        s3 = boto3.client(
            "s3", endpoint_url=r2_endpoint,
            aws_access_key_id=r2_key_id, aws_secret_access_key=r2_secret,
            region_name="auto",
        )
        s3.put_object(
            Bucket=r2_bucket, Key=object_key, Body=data,
            ContentType=content_type_map.get(ext, "video/mp4"),
        )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _r2_put)

    if r2_public:
        video_url = f"{r2_public}/{object_key}"
    else:
        video_url = f"{r2_endpoint.rstrip('/')}/{r2_bucket}/{object_key}"

    # 5. Create Reel record (F2-URS04-SRS04)
    parsed_product_id = None
    if product_id:
        try:
            parsed_product_id = UUID(product_id)
        except ValueError:
            pass

    reel = create_reel(
        db=db,
        user_id=current_user.user_id,
        prompt_text="",          # no prompt for user-uploaded video
        product_id=parsed_product_id,
    )
    update_reel(db, reel=reel, uploaded_video_url=video_url)

    # 6. Queue caption generation + overlay (target="upload")
    process_reel_generation.delay(
        str(reel.reel_id), platform, overlay_position, "upload",
    )

    return reel
