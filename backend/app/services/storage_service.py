"""
Cloudflare R2 Storage Service
=============================
S3-compatible object storage client using boto3.
Provides upload utilities with dynamic folder grouping for organizing
images by user, category, date, or custom prefixes.

Usage in FastAPI routes:
    from app.services.storage_service import upload_image, upload_file

    @router.post("/upload")
    async def upload(file: UploadFile, user_id: str):
        result = await upload_image(file, user_id=user_id, category="avatars")
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

from app.core.config import (
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT_URL,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# S3 Client Initialization (singleton)
# ---------------------------------------------------------------------------

_s3_client = None


def _get_s3_client():
    """
    Lazily initialize and return a reusable boto3 S3 client
    configured for Cloudflare R2.
    """
    global _s3_client
    if _s3_client is None:
        if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL]):
            raise RuntimeError(
                "R2 storage is not configured. "
                "Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT_URL "
                "environment variables."
            )
        _s3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        logger.info("Cloudflare R2 S3 client initialized.")
    return _s3_client


# ---------------------------------------------------------------------------
# Content-Type Mapping
# ---------------------------------------------------------------------------

_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
}

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}


def _guess_content_type(filename: str) -> str:
    """Return a MIME type based on file extension, defaulting to octet-stream."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _MIME_TYPES.get(ext, "application/octet-stream")


# ---------------------------------------------------------------------------
# Key Builder
# ---------------------------------------------------------------------------

def build_object_key(
    filename: str,
    *,
    prefix: str = "uploads",
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    use_date_partition: bool = True,
    unique: bool = True,
) -> str:
    """
    Construct a structured object key for the R2 bucket.

    Examples (depending on parameters):
        uploads/2026/05/05/abc123_photo.jpg
        images/users/u-1234/avatars/abc123_photo.jpg
        products/banners/abc123_photo.jpg

    Args:
        filename:           Original file name (used for extension & base name).
        prefix:             Root folder in the bucket (e.g. "uploads", "images").
        user_id:            Optional user identifier to create a user-scoped folder.
        category:           Optional category subfolder (e.g. "avatars", "products").
        use_date_partition: If True, adds YYYY/MM/DD date folders.
        unique:             If True, prepends a short UUID to prevent collisions.
    """
    parts: list[str] = [prefix]

    if user_id:
        parts.append(f"users/{user_id}")

    if category:
        parts.append(category)

    if use_date_partition:
        now = datetime.now(timezone.utc)
        parts.append(f"{now.year}/{now.month:02d}/{now.day:02d}")

    # Sanitise the original filename and optionally prepend a UUID fragment
    safe_name = filename.replace(" ", "_")
    if unique:
        safe_name = f"{uuid.uuid4().hex[:12]}_{safe_name}"

    parts.append(safe_name)
    return "/".join(parts)


# ---------------------------------------------------------------------------
# Upload Helpers
# ---------------------------------------------------------------------------

async def upload_image(
    file: UploadFile,
    *,
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    prefix: str = "images",
    use_date_partition: bool = True,
    bucket: Optional[str] = None,
) -> dict:
    """
    Upload an image file to Cloudflare R2.

    Args:
        file:               FastAPI UploadFile instance.
        user_id:            Optional user ID for folder grouping.
        category:           Optional category subfolder (e.g. "avatars", "banners").
        prefix:             Root folder in bucket. Defaults to "images".
        use_date_partition: Whether to add date-based subfolders.
        bucket:             Override bucket name (uses config default if None).

    Returns:
        dict with keys: "key", "url", "bucket", "content_type", "size"

    Raises:
        ValueError:  If the file extension is not an allowed image type.
        RuntimeError: If the upload to R2 fails.
    """
    filename = file.filename or "untitled"
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError(
            f"File type '{ext}' is not allowed. "
            f"Accepted: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    return await upload_file(
        file,
        user_id=user_id,
        category=category,
        prefix=prefix,
        use_date_partition=use_date_partition,
        bucket=bucket,
    )


async def upload_file(
    file: UploadFile,
    *,
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    prefix: str = "uploads",
    use_date_partition: bool = True,
    bucket: Optional[str] = None,
) -> dict:
    """
    Upload any file to Cloudflare R2.

    Returns:
        dict with keys: "key", "url", "bucket", "content_type", "size"

    Raises:
        RuntimeError: If the upload to R2 fails.
    """
    target_bucket = bucket or R2_BUCKET_NAME
    if not target_bucket:
        raise RuntimeError("R2_BUCKET_NAME is not configured.")

    filename = file.filename or "untitled"
    content_type = file.content_type or _guess_content_type(filename)

    object_key = build_object_key(
        filename,
        prefix=prefix,
        user_id=user_id,
        category=category,
        use_date_partition=use_date_partition,
    )

    try:
        s3 = _get_s3_client()
        file_body = await file.read()
        file_size = len(file_body)

        s3.put_object(
            Bucket=target_bucket,
            Key=object_key,
            Body=file_body,
            ContentType=content_type,
        )

        logger.info(
            "Uploaded %s to R2 bucket '%s' (%d bytes)",
            object_key, target_bucket, file_size,
        )

    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 upload failed for '%s': %s", object_key, exc)
        raise RuntimeError(f"Failed to upload file to R2: {exc}") from exc
    finally:
        await file.seek(0)  # Reset file pointer for potential re-reads

    # Build a public URL if a custom domain / public URL is configured
    if R2_PUBLIC_URL:
        url = f"{R2_PUBLIC_URL.rstrip('/')}/{object_key}"
    else:
        url = f"{R2_ENDPOINT_URL.rstrip('/')}/{target_bucket}/{object_key}"

    return {
        "key": object_key,
        "url": url,
        "bucket": target_bucket,
        "content_type": content_type,
        "size": file_size,
    }


# ---------------------------------------------------------------------------
# Delete Helper
# ---------------------------------------------------------------------------

async def delete_file(object_key: str, *, bucket: Optional[str] = None) -> bool:
    """
    Delete an object from R2 by its key.

    Returns True if the deletion succeeded, False otherwise.
    """
    target_bucket = bucket or R2_BUCKET_NAME
    try:
        s3 = _get_s3_client()
        s3.delete_object(Bucket=target_bucket, Key=object_key)
        logger.info("Deleted '%s' from bucket '%s'", object_key, target_bucket)
        return True
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 delete failed for '%s': %s", object_key, exc)
        return False


def get_file(object_key: str, *, bucket: Optional[str] = None) -> dict:
    """
    Fetch an object from R2 by its key.

    Returns the boto3 get_object response (contains 'Body' stream and metadata).

    Raises:
        RuntimeError: If the file cannot be retrieved.
    """
    target_bucket = bucket or R2_BUCKET_NAME
    try:
        s3 = _get_s3_client()
        response = s3.get_object(Bucket=target_bucket, Key=object_key)
        return response
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 get failed for '%s': %s", object_key, exc)
        raise RuntimeError(f"Failed to retrieve file from R2: {exc}") from exc


# ─────────────────────────────────────────────────────────────────────────────
# Helper for uploading raw bytes (used by reel_routes.py for video upload)
# ─────────────────────────────────────────────────────────────────────────────

def upload_raw_bytes_to_r2(
    data: bytes,
    *,
    filename: str = "file.bin",
    prefix: str = "uploads",
    user_id: Optional[str] = None,
    category: Optional[str] = None,
) -> str:
    """
    Upload raw bytes to Cloudflare R2 (used by video/reel upload endpoints).

    Convenience wrapper for uploading file content already in memory,
    without needing a FastAPI UploadFile object.

    Args:
        data: Raw file bytes to upload
        filename: Original filename (used for extension & object key)
        prefix: Root folder in bucket (e.g. "videos/reels/uploads")
        user_id: Optional user ID for folder grouping
        category: Optional category subfolder (e.g. "uploads")

    Returns:
        Public URL to the uploaded file on R2

    Raises:
        RuntimeError: If R2 is not configured or upload fails
    """
    target_bucket = R2_BUCKET_NAME
    if not target_bucket:
        raise RuntimeError("R2_BUCKET_NAME is not configured.")

    content_type = _guess_content_type(filename)
    object_key = build_object_key(
        filename, prefix=prefix, user_id=user_id, category=category
    )

    try:
        s3 = _get_s3_client()
        s3.put_object(
            Bucket=target_bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
        )
        logger.info("Uploaded %d bytes to R2 key '%s'", len(data), object_key)
    except (BotoCoreError, ClientError) as exc:
        logger.error("R2 upload failed for '%s': %s", object_key, exc)
        raise RuntimeError(f"Failed to upload file to R2: {exc}") from exc

    # Build public URL
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key}"
    else:
        return f"{R2_ENDPOINT_URL.rstrip('/')}/{target_bucket}/{object_key}"
