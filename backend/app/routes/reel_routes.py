import os
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, Field

from sqlalchemy.orm import joinedload
from app.dependencies import get_db, get_current_user
from app.models.models import User, Reel, Product
from app.services.reel_service import create_reel, get_reel, update_reel
from app.services.upload_service import (
    validate_video_file,
    probe_video_duration,
    upload_video_to_r2,
)
from app.services.ai_service import generate_prompt_from_template, enhance_prompt, generate_guided_prompt
from app.worker import process_reel_generation

logger = logging.getLogger(__name__)


def _load_product_context(product_id: Optional[UUID], user_id, db: Session):
    """
    Shared helper: load full product context for multimodal Gemini prompt calls.

    Fetches ALL product images from R2 (not just the primary) so Gemini can see
    every angle and view of the product, producing more accurate and visually
    specific prompts.  Images are sorted primary-first and capped at 4 to keep
    the Gemini request size reasonable.

    Returns:
        (product_name, product_description, images)
        where images = list of (bytes, mime_type) tuples, empty list if none available.

    Callers fall back gracefully to text-only Gemini when images is empty.
    """
    product_name = ""
    product_description = ""
    images: list[tuple[bytes, str]] = []

    if not product_id:
        return product_name, product_description, images

    product = (
        db.query(Product)
        .options(joinedload(Product.images))
        .filter(Product.product_id == product_id, Product.user_id == user_id)
        .first()
    )
    if not product:
        return product_name, product_description, images

    product_name = product.product_name or ""
    product_description = product.description or ""

    if not product.images:
        return product_name, product_description, images

    # Sort: primary image first, then the rest; cap at 4 to keep request size reasonable
    sorted_imgs = sorted(product.images, key=lambda img: (0 if img.is_primary else 1))[:4]

    from app.services.storage_service import get_file
    for img in sorted_imgs:
        raw_key = img.image_url
        if not raw_key:
            continue
        # Only R2 object keys need boto3 fetch; skip data: URIs and https:// URLs
        if raw_key.startswith("data:") or raw_key.startswith("http"):
            continue
        try:
            file_obj = get_file(raw_key)
            img_bytes = file_obj["Body"].read()
            img_mime = file_obj.get("ContentType", "image/jpeg")
            images.append((img_bytes, img_mime))
            logger.info(f"Product image loaded: {raw_key} ({len(img_bytes)} bytes)")
        except Exception as exc:
            logger.warning(f"Could not load product image '{raw_key}': {exc}")

    logger.info(
        f"Product context loaded for '{product_name}': "
        f"{len(images)}/{len(sorted_imgs)} images fetched"
    )
    return product_name, product_description, images
router = APIRouter(prefix="/api/reels", tags=["Reels"])


class PromptFromTemplateRequest(BaseModel):
    template_type: str = Field(..., description="product_showcase | flash_sale | new_arrival | bundle_deal | review_highlight | tutorial")
    product_id: Optional[UUID] = None
    duration: Optional[int] = 30

class EnhancePromptRequest(BaseModel):
    prompt_text: str = Field(..., max_length=500)
    product_id: Optional[UUID] = None
    duration: Optional[int] = 30

class GuidedPromptRequest(BaseModel):
    """Request body for Guide Me → Auto-Build Prompt (multimodal Gemini generation)."""
    mood:          Optional[str] = None   # Mood/Vibe card label selected by user
    target:        Optional[str] = None   # Target Audience card label
    style:         Optional[str] = None   # Visual Style card label
    focus:         Optional[str] = None   # Scene Focus card label
    lighting:      Optional[str] = None   # Lighting & Environment card label
    camera_motion: Optional[str] = None   # Camera Motion card label (e.g. "Slow Zoom In")
    product_id:    Optional[UUID] = None  # Selected product for context + image
    duration:      Optional[int] = 30

class PromptResponse(BaseModel):
    prompt: str

class ReelGenerateRequest(BaseModel):
    prompt_text: str = Field(..., max_length=500, description="Max 500 characters")
    product_id: UUID
    platform: Optional[str] = "ig"
    overlay_position: Optional[str] = "bottom-right"
    duration: Optional[int] = 10
    with_audio: Optional[bool] = False

class ReelRegenerateRequest(BaseModel):
    target: str = Field(..., description="'video' or 'caption'")
    platform: Optional[str] = "ig"
    overlay_position: Optional[str] = "bottom-right"
    duration: Optional[int] = 30
    with_audio: Optional[bool] = False  # Must mirror the original generation's audio choice
    # Optional new prompt — user may have edited the prompt before re-generating.
    # If provided, overwrites the reel's stored prompt_text before queuing the worker.
    prompt_text: Optional[str] = Field(None, max_length=500)

class ReelResponse(BaseModel):
    reel_id: UUID
    status: str
    prompt_text: str
    error_message: Optional[str] = None
    final_commercial_video_url: Optional[str] = None
    # raw_video_url: pre-overlay video (no logo) — used by frontend for
    # Option B logo toggle: download without logo uses this URL instead.
    raw_video_url: Optional[str] = None
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
        duration=req.duration,
        with_audio=req.with_audio,
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

    # If user edited the prompt before re-generating, persist the updated text.
    # Worker reads reel.prompt_text from DB, so we must save it before queuing.
    if req.prompt_text and req.target in ["video", "all"]:
        update_reel(db, reel=reel, prompt_text=req.prompt_text)
        logger.info(f"Reel {reel_id} prompt updated before regen: {len(req.prompt_text)} chars")

    # Reset status to "Generating" BEFORE queuing so the frontend polling loop
    # doesn't immediately see the old "Completed" status and display stale content.
    # Also clear b_roll_url so video regen starts a fresh clip (not from old checkpoint).
    if req.target in ["video", "all"]:
        update_reel(db, reel=reel, status="Generating", clear_b_roll=True)
    else:
        # Caption-only — video is unchanged, just reset status for polling
        update_reel(db, reel=reel, status="Generating")
    logger.info(f"Reel {reel_id} status reset to Generating for regen target='{req.target}'")

    # Send task to Celery — pass with_audio for regen consistency
    process_reel_generation.delay(
        str(reel.reel_id), req.platform, req.overlay_position, req.target,
        duration=req.duration,
        with_audio=req.with_audio,
    )

    return reel


@router.post("/upload-video", response_model=ReelResponse)
async def upload_reel_video(
    file: UploadFile = File(...),
    product_id: Optional[str] = Form(None),
    platform: str = Form("ig"),
    overlay_position: str = Form("bottom-right"),
    with_audio: bool = Form(True),   # default True — preserve original audio
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
    # with_audio=True by default — preserve original audio from uploaded video.
    # User can override via the audio toggle in the UI before uploading.
    process_reel_generation.delay(
        str(reel.reel_id), platform, overlay_position, "upload",
        with_audio=with_audio,
    )

    logger.info(f"Video upload completed for reel {reel.reel_id}, user {current_user.user_id}")
    return reel


@router.post("/generate-prompt", response_model=PromptResponse)
async def generate_prompt_endpoint(
    req: PromptFromTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a contextual video prompt from a quick-prompt template + product info.

    Called when the user clicks a quick-prompt chip (Product Showcase, Flash Sale, etc.)
    in the Create Reel prompt composer. Uses Gemini to produce a production-ready brief
    that references the actual selected product name and description.

    Request body:
        - template_type: One of product_showcase | flash_sale | new_arrival |
                         bundle_deal | review_highlight | tutorial
        - product_id: Selected product UUID (optional — falls back to generic prompt)
        - duration: Desired video length in seconds

    Returns:
        { prompt: str } — ready to fill into the prompt textarea
    """
    product_name, product_description, product_images = _load_product_context(
        req.product_id, current_user.user_id, db
    )

    prompt = await generate_prompt_from_template(
        template_type=req.template_type,
        product_name=product_name,
        product_description=product_description,
        duration=req.duration or 30,
        product_images=product_images,
    )
    return {"prompt": prompt}


@router.post("/enhance-prompt", response_model=PromptResponse)
async def enhance_prompt_endpoint(
    req: EnhancePromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Improve an existing prompt using Gemini to make it more cinematic and specific.

    Called when the user clicks the "Enhance" button after typing a rough prompt idea.
    Gemini rewrites the draft to include professional creative direction (camera movements,
    lighting, transitions) while preserving the user's original concept.
    Sends all available product images for multimodal visual context.

    Request body:
        - prompt_text: The user's current draft (max 500 chars)
        - product_id: Selected product UUID for additional context (optional)
        - duration: Video length for pacing guidance (optional)

    Returns:
        { prompt: str } — the improved version, ready to replace the textarea content
    """
    if not req.prompt_text.strip():
        raise HTTPException(status_code=400, detail="prompt_text cannot be empty")

    product_name, product_description, product_images = _load_product_context(
        req.product_id, current_user.user_id, db
    )

    enhanced = await enhance_prompt(
        prompt_text=req.prompt_text,
        product_name=product_name,
        product_description=product_description,
        duration=req.duration or 30,
        product_images=product_images,
    )
    return {"prompt": enhanced}


@router.post("/generate-guided-prompt", response_model=PromptResponse)
async def generate_guided_prompt_endpoint(
    req: GuidedPromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guide Me → Auto-Build Prompt: generate a production-ready video prompt from
    creative chip selections + full product context using Gemini (multimodal).

    Sends all chip selections, product name, description, and ALL product images
    (up to 4, sorted primary-first) so Gemini can reference the product's actual
    visual appearance from multiple angles.

    Request body:
        - mood:       Selected Mood/Vibe chip label (e.g. "💎 Luxury & Premium")
        - target:     Selected Target Audience chip label
        - style:      Selected Visual Style chip label
        - focus:      Selected Scene Focus chip label
        - product_id: UUID of the selected product (optional)
        - duration:   Requested video length in seconds

    Returns:
        { prompt: str } — ready to fill into the prompt textarea
    """
    product_name, product_description, product_images = _load_product_context(
        req.product_id, current_user.user_id, db
    )

    prompt = await generate_guided_prompt(
        mood=req.mood,
        target=req.target,
        style=req.style,
        focus=req.focus,
        lighting=req.lighting,
        camera_motion=req.camera_motion,
        product_name=product_name,
        product_description=product_description,
        product_images=product_images,
        duration=req.duration or 30,
    )
    return {"prompt": prompt}


@router.get("/{reel_id}/download")
async def download_reel_video(
    reel_id: UUID,
    with_logo: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    F2-URS05 Option B: Download reel video with or without brand logo.

    with_logo=true  → final_commercial_video_url (logo baked by worker)
    with_logo=false → raw_video_url (pre-overlay, no logo); falls back to overlaid

    Two response strategies depending on where the video is stored:

    R2 object key → JSONResponse {"download_url": "<presigned>"}.
        Presigned URL has ResponseContentDisposition=attachment so the browser
        downloads the file directly from Cloudflare R2 without routing through
        this server. Fast, no memory usage, supports large files.

    CDN URL (fal.ai) → async StreamingResponse.
        Proxies the CDN video through the backend with chunked transfer.
        Uses httpx.AsyncClient.stream() to avoid buffering large videos in RAM.

    Returns:
        JSONResponse  { download_url } for R2 keys
        StreamingResponse              for CDN URLs
    """
    from app.services.storage_service import _get_s3_client
    from app.core.config import R2_BUCKET_NAME

    reel = get_reel(db=db, reel_id=reel_id, user_id=current_user.user_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    video_ref = (
        reel.final_commercial_video_url
        if with_logo
        else (reel.raw_video_url or reel.final_commercial_video_url)
    )

    if not video_ref:
        raise HTTPException(status_code=404, detail="Video not ready yet")

    filename = f"reel_{reel_id}.mp4"

    # ── R2 object key → presigned URL (browser downloads directly from R2) ───
    # Avoids routing video bytes through this server — fast and memory-efficient.
    # ResponseContentDisposition forces the browser download dialog regardless of
    # the <a download> cross-origin restriction.
    if not video_ref.startswith("http"):
        try:
            s3 = _get_s3_client()
            presigned = s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": R2_BUCKET_NAME,
                    "Key": video_ref,
                    "ResponseContentDisposition": f'attachment; filename="{filename}"',
                    "ResponseContentType": "video/mp4",
                },
                ExpiresIn=300,  # 5 min TTL — enough for a single download
            )
            logger.info(f"[Download] Presigned URL generated for reel {reel_id} (with_logo={with_logo})")
            return JSONResponse({"download_url": presigned})
        except Exception as exc:
            logger.error(f"[Download] Presigned URL generation failed for reel {reel_id}: {exc}")
            raise HTTPException(status_code=500, detail=f"Could not generate download URL: {exc}")

    # ── CDN URL (fal.ai / Veo) → async streaming proxy ───────────────────────
    # Chunks are forwarded immediately without buffering the entire video in RAM.
    logger.info(f"[Download] Streaming CDN video for reel {reel_id} (with_logo={with_logo})")

    async def _stream_cdn():
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0),
            follow_redirects=True,
        ) as client:
            async with client.stream("GET", video_ref) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(chunk_size=65536):
                    yield chunk

    return StreamingResponse(
        _stream_cdn(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )
