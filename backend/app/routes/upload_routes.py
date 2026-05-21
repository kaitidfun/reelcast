from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from botocore.exceptions import BotoCoreError, ClientError

from app.dependencies import get_db, get_current_user
from app.models.models import User
from app.services.storage_service import (
    upload_image,
    delete_file,
    get_file,
    _guess_content_type,
)

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/profile-image")
async def upload_profile_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a profile image for the current user.
    Stores the file in R2 under  images/users/{user_id}/avatar/
    and saves the R2 object KEY (not URL) in users.profile_image.
    """
    try:
        result = await upload_image(
            file,
            user_id=str(current_user.user_id),
            category="avatar",
            prefix="images",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Delete the old image from R2 if one existed
    old_key = current_user.profile_image
    if old_key:
        try:
            await delete_file(old_key)
        except Exception:
            pass  # Non-critical: old file cleanup is best-effort

    # Persist the R2 object KEY (not the URL) to the database
    current_user.profile_image = result["key"]
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Profile image updated successfully",
        "profile_image": result["key"],
        "key": result["key"],
    }


@router.get("/profile-image/{user_id}")
def serve_profile_image(
    user_id: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint that proxies a user's profile image from R2.
    No auth required — profile images are public.
    The browser uses this URL as the <img src>.
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user or not user.profile_image:
        raise HTTPException(status_code=404, detail="Profile image not found")

    object_key = user.profile_image

    # Handle legacy entries where a full URL was stored instead of just the key
    if object_key.startswith("http"):
        from urllib.parse import urlparse
        parsed = urlparse(object_key)
        # Path is like  /bucket-name/images/users/.../file.jpg
        path = parsed.path.lstrip("/")
        # Strip the bucket name prefix if present
        parts = path.split("/", 1)
        if len(parts) > 1 and not parts[0].startswith("images"):
            object_key = parts[1]
        else:
            object_key = path

    try:
        file_obj = get_file(object_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    content_type = file_obj.get("ContentType", _guess_content_type(object_key))

    return StreamingResponse(
        file_obj["Body"],
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",  # Cache for 1 day
        },
    )


@router.get("/images/{object_key:path}")
def serve_generic_image(
    object_key: str,
):
    """
    Public endpoint that proxies any image from R2 by its key.
    """
    if not object_key:
        raise HTTPException(status_code=400, detail="No object key provided")

    try:
        file_obj = get_file(object_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    content_type = file_obj.get("ContentType", _guess_content_type(object_key))

    return StreamingResponse(
        file_obj["Body"],
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",  # Cache for 1 day
        },
    )


@router.get("/videos/{object_key:path}")
def serve_generic_video(
    object_key: str,
):
    """
    Public endpoint that proxies any video from R2 by its key.

    Used by the frontend to stream R2-stored videos (uploaded reels, overlaid outputs)
    since the R2 bucket may not have public access enabled.  Pattern mirrors the
    /images/{key} endpoint so the frontend can use a consistent proxy strategy.
    """
    if not object_key:
        raise HTTPException(status_code=400, detail="No object key provided")

    try:
        file_obj = get_file(object_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    content_type = file_obj.get("ContentType", "video/mp4")

    return StreamingResponse(
        file_obj["Body"],
        media_type=content_type,
        headers={
            # Allow partial-content requests (required for HTML5 video seeking)
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
    )
