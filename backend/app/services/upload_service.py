"""
Video Upload Service
====================
Handles user-uploaded video validation and processing.

Validates format, file size, and duration before accepting uploads to R2 storage.

Usage:
    from app.services.upload_service import validate_video_file, upload_video_to_r2

    # Validate user's video
    errors = validate_video_file("video.mp4", 50 * 1024 * 1024, 45.5)
    if errors:
        return {"error": errors[0]}

    # Upload to R2
    video_url = await upload_video_to_r2(
        file_data=file_bytes,
        filename="upload.mp4",
        user_id="user-123"
    )
"""

import os
import asyncio
import tempfile
import logging
from typing import Optional

import ffmpeg

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

ALLOWED_VIDEO_FORMATS = {".mp4", ".mov", ".avi"}
MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB per SRS
MAX_VIDEO_DURATION_SECONDS = 60  # Per SRS requirement


# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_video_file(
    filename: str,
    file_size: int,
    duration_seconds: Optional[float] = None,
) -> list[str]:
    """
    Validate video file against format, size, and duration requirements.

    Returns list of validation errors (empty list if valid).

    Args:
        filename: Original filename (used for extension check)
        file_size: File size in bytes
        duration_seconds: Video duration in seconds (optional if duration already checked)

    Returns:
        List of error messages (empty if file is valid)

    Validation Rules (per SRS F2-URS04-SRS01):
        - Format: MP4, MOV, or AVI only
        - Size: Max 500 MB
        - Duration: Max 60 seconds
    """
    errors = []

    # Format validation
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_VIDEO_FORMATS:
        allowed = ", ".join(sorted(ALLOWED_VIDEO_FORMATS))
        errors.append(f"Unsupported format '{ext}'. Allowed: {allowed}")

    # Size validation
    if file_size > MAX_VIDEO_SIZE_BYTES:
        size_mb = file_size / (1024 * 1024)
        max_mb = MAX_VIDEO_SIZE_BYTES / (1024 * 1024)
        errors.append(f"File size {size_mb:.1f} MB exceeds {max_mb:.0f} MB limit")

    # Duration validation (if provided)
    if duration_seconds is not None and duration_seconds > MAX_VIDEO_DURATION_SECONDS:
        errors.append(f"Duration {duration_seconds:.1f}s exceeds {MAX_VIDEO_DURATION_SECONDS}s limit")

    return errors


async def probe_video_duration(file_bytes: bytes, ext: str) -> Optional[float]:
    """
    Probe video file to extract duration using FFmpeg.

    Returns duration in seconds, or None if probe fails (logs warning but doesn't raise).

    Args:
        file_bytes: Raw video file bytes
        ext: File extension including dot (e.g., ".mp4")

    Returns:
        Duration in seconds, or None if probe fails
    """
    tmp_path = None
    try:
        # Write bytes to temp file
        fd, tmp_path = tempfile.mkstemp(suffix=ext)
        with os.fdopen(fd, "wb") as fh:
            fh.write(file_bytes)

        # Run ffprobe in executor (blocking operation)
        loop = asyncio.get_event_loop()

        def _probe():
            probe = ffmpeg.probe(tmp_path)
            return float(probe.get("format", {}).get("duration", 0))

        duration = await loop.run_in_executor(None, _probe)
        logger.debug(f"Video duration: {duration:.2f}s")
        return duration

    except Exception as e:
        logger.warning(f"ffprobe failed (duration check skipped): {e}")
        return None

    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Upload to R2
# ─────────────────────────────────────────────────────────────────────────────

async def upload_video_to_r2(
    file_data: bytes,
    filename: str,
    user_id: str,
) -> str:
    """
    Upload user's video file to Cloudflare R2 storage.

    Args:
        file_data: Raw video file bytes
        filename: Original filename (used for object key)
        user_id: User ID for organizing uploads in R2

    Returns:
        Public URL to uploaded video on R2

    Raises:
        RuntimeError if R2 is not configured or upload fails

    R2 Path Structure:
        videos/reels/uploads/{user_id}/{uuid}{ext}
    """
    from app.services.storage_service import upload_raw_bytes_to_r2

    try:
        public_url = upload_raw_bytes_to_r2(
            data=file_data,
            filename=filename,
            prefix="videos/reels/uploads",
            user_id=user_id,
            category=None,
        )
        logger.info(f"Video uploaded for user {user_id}: {public_url}")
        return public_url

    except Exception as e:
        logger.error(f"R2 upload failed for user {user_id}: {e}")
        raise RuntimeError(f"Failed to upload video to R2: {e}") from e
