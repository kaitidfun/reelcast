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

def get_public_url(object_key_or_url: str) -> str:
    """
    Resolve an R2 object key or partial path to a full public URL.

    Product images/logos are stored in DB as raw object keys (e.g.
    "products/users/.../logo.webp") rather than full URLs.  This function
    converts them so they are accessible by external services (fal.ai, httpx).

    If the value is already a full URL (starts with http/https), it is
    returned unchanged.

    NOTE: If R2_PUBLIC_URL is not configured, the returned URL will be the
    S3 API endpoint which requires authentication.  Use get_presigned_url()
    instead when the URL must be accessible by external services without auth.

    Args:
        object_key_or_url: R2 object key or an already-resolved URL

    Returns:
        Full public URL string
    """
    if object_key_or_url.startswith("http://") or object_key_or_url.startswith("https://"):
        return object_key_or_url  # Already a full URL — nothing to do

    # Build URL from config (same logic as upload helpers)
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key_or_url}"
    elif R2_ENDPOINT_URL and R2_BUCKET_NAME:
        return f"{R2_ENDPOINT_URL.rstrip('/')}/{R2_BUCKET_NAME}/{object_key_or_url}"
    else:
        # R2 not configured — return as-is (will fail downstream, but at least
        # the error message will be descriptive)
        logger.warning(
            "Cannot resolve public URL for '%s': R2 not configured",
            object_key_or_url,
        )
        return object_key_or_url


def get_presigned_url(object_key_or_url: str, expiry: int = 3600) -> str:
    """
    Generate a time-limited presigned GET URL for an R2 object.

    Unlike get_public_url(), this works even when the R2 bucket is NOT public.
    Boto3 signs the URL with credentials so anyone with the URL can access
    the object for `expiry` seconds — no bucket-level public access needed.

    Priority:
        1. If value is already a full URL → return as-is
        2. If R2_PUBLIC_URL is configured → return permanent public URL (no expiry)
        3. Otherwise → generate presigned GET URL that expires after `expiry` seconds

    Use this for any URL that must be accessible by external services:
        - fal.ai image_url parameter (image-to-video mode)
        - httpx overlay download in overlay_service
        - Browser display of product images in API responses

    Args:
        object_key_or_url: R2 object key (e.g. "products/users/.../img.webp")
                           or an already-resolved URL
        expiry: Presigned URL validity in seconds (default 3600 = 1 hour).
                1 hour is enough for any generation pipeline run or page session.

    Returns:
        Accessible URL — permanent public URL if R2_PUBLIC_URL is set,
        presigned URL otherwise
    """
    # Already a full URL (fal.ai CDN, external, etc.) — nothing to sign
    if object_key_or_url.startswith("http://") or object_key_or_url.startswith("https://"):
        return object_key_or_url

    # Data URL (base64 image stored directly in DB) — return as-is, no signing needed
    if object_key_or_url.startswith("data:"):
        return object_key_or_url

    # If a public CDN is configured, use it (permanent URL, no signing overhead)
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key_or_url}"

    # No public URL — generate a presigned GET URL (accessible without auth)
    if not R2_BUCKET_NAME:
        logger.warning(
            "Cannot generate presigned URL for '%s': R2_BUCKET_NAME not configured",
            object_key_or_url,
        )
        return object_key_or_url

    try:
        s3 = _get_s3_client()
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET_NAME, "Key": object_key_or_url},
            ExpiresIn=expiry,
        )
        logger.debug(
            "Generated presigned URL for '%s' (expires in %ds)", object_key_or_url, expiry
        )
        return url
    except (BotoCoreError, ClientError) as exc:
        logger.error(
            "Failed to generate presigned URL for '%s': %s", object_key_or_url, exc
        )
        return object_key_or_url


def upload_raw_bytes_to_r2(
    data: bytes,
    *,
    filename: str = "file.bin",
    prefix: str = "uploads",
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    return_key_only: bool = False,
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
        return_key_only: If True, return the R2 object key instead of the full public URL.
            Use this when storing references in the DB — the frontend can then proxy through
            /api/upload/videos/{key} regardless of whether R2 is publicly accessible.

    Returns:
        R2 object key (when return_key_only=True) or public URL to the uploaded file

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

    # Return only the object key when requested (frontend proxies via /api/upload/videos/{key})
    if return_key_only:
        return object_key

    # Build public URL
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key}"
    else:
        return f"{R2_ENDPOINT_URL.rstrip('/')}/{target_bucket}/{object_key}"
