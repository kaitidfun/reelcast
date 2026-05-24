"""
FFmpeg Overlay Service
======================
Handles video overlay operations with product images, logos, and watermarks.
Supports configurable positioning and graceful fallback on errors.

Usage:
    from app.services.overlay_service import apply_overlay

    new_url = await apply_overlay(
        video_url="https://...",
        overlay_url="https://...",
        position="bottom-right",
        reel_id="abc-123"
    )
"""

import os
import shutil
import asyncio
import tempfile
import logging
from typing import Optional

import ffmpeg
import httpx

from app.services.storage_service import upload_raw_bytes_to_r2

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# FFmpeg availability check (runs once at import time for fast fail)
# ─────────────────────────────────────────────────────────────────────────────
_FFMPEG_AVAILABLE: bool = shutil.which("ffmpeg") is not None
if not _FFMPEG_AVAILABLE:
    logger.warning(
        "[Overlay] ffmpeg executable not found in PATH. "
        "Overlay and audio-strip operations will be skipped. "
        "Install FFmpeg from https://www.gyan.dev/ffmpeg/builds/ (Windows) "
        "or https://ffmpeg.org/download.html, add to PATH, then restart Celery."
    )

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

OVERLAY_MAX_WIDTH = 150  # Max width in pixels (prevents logo covering video content)
POSITION_COORDS = {
    'top-left': ('10', '10'),
    'top-right': ('main_w-overlay_w-10', '10'),
    'bottom-left': ('10', 'main_h-overlay_h-10'),
    'bottom-right': ('main_w-overlay_w-10', 'main_h-overlay_h-10'),
    'center': ('(main_w-overlay_w)/2', '(main_h-overlay_h)/2'),
}


# ─────────────────────────────────────────────────────────────────────────────
# Download & Cleanup Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def download_to_temp(url: str, suffix: str = "") -> str:
    """
    Download a remote URL to a temporary local file.

    Args:
        url: Remote URL to download
        suffix: File extension suffix (e.g., ".mp4", ".png")

    Returns:
        Path to the temporary file

    Raises:
        httpx.HTTPError: If download fails
    """
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(resp.content)

    logger.debug(f"Downloaded {len(resp.content)} bytes to {path}")
    return path


def _cleanup_temp_files(*paths: Optional[str]) -> None:
    """
    Safely remove temporary files. Logs errors but doesn't raise.

    Args:
        *paths: Variable number of file paths to clean up
    """
    for tmp_path in paths:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
                logger.debug(f"Cleaned up temp file: {tmp_path}")
            except OSError as e:
                logger.warning(f"Failed to remove {tmp_path}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# FFmpeg Overlay Operations
# ─────────────────────────────────────────────────────────────────────────────

async def overlay_watermark(
    video_path: str,
    overlay_path: str,
    position: str,
    output_path: str,
    with_audio: bool = True,
) -> str:
    """
    Composite an overlay image onto a video using FFmpeg.

    Overlay image is scaled to max 150px width to prevent
    covering video content while maintaining logo visibility.

    Args:
        video_path: Local path to input video file
        overlay_path: Local path to overlay image (PNG/JPG)
        position: Placement option - 'top-left', 'top-right', 'bottom-left',
                 'bottom-right', or 'center'
        output_path: Local path for output MP4 file
        with_audio: If True, preserve original audio track. If False, strip
                   audio entirely (-an) — used when user selects "No Audio".

    Returns:
        Path to output MP4 file

    Raises:
        RuntimeError: If FFmpeg is not installed or compositing fails
    """
    if not _FFMPEG_AVAILABLE:
        raise RuntimeError(
            "ffmpeg not found in PATH — install FFmpeg and restart Celery worker. "
            "Windows builds: https://www.gyan.dev/ffmpeg/builds/"
        )

    # Resolve position coordinates (or default to bottom-right)
    overlay_x, overlay_y = POSITION_COORDS.get(position, POSITION_COORDS['bottom-right'])

    logger.info(f"Compositing overlay at position '{position}': {overlay_path} (audio={'on' if with_audio else 'stripped'})")

    def _process():
        try:
            input_file  = ffmpeg.input(video_path)
            input_overlay = ffmpeg.input(overlay_path)

            # ── Explicit stream splitting ─────────────────────────────────────
            # Always use input_file.video (not the full input object) for the
            # overlay filter chain.  This prevents the audio stream from ever
            # entering the filter graph — a more reliable approach than relying
            # on the -an flag to remove it at the output stage.
            video_stream = input_file.video

            # Scale overlay to max width while preserving aspect ratio
            input_overlay = ffmpeg.filter(input_overlay, 'scale', OVERLAY_MAX_WIDTH, -1)

            # Composite: video_stream has NO audio reference → overlaid is video-only
            overlaid = ffmpeg.overlay(video_stream, input_overlay, x=overlay_x, y=overlay_y)

            if with_audio:
                # Re-attach audio from original input for the WITH-AUDIO path.
                # Audio is only added back explicitly here — never leaks into
                # the no-audio path.
                out = ffmpeg.output(
                    overlaid,
                    input_file.audio,
                    output_path,
                    vcodec='libx264',
                    acodec='aac',
                    strict='experimental',
                )
            else:
                # overlaid is already a video-only stream (no audio reference).
                # Output contains no audio track — no need for -an flag.
                out = ffmpeg.output(
                    overlaid,
                    output_path,
                    vcodec='libx264',
                )

            ffmpeg.run(out, overwrite_output=True, quiet=True)
            logger.info(f"FFmpeg compositing complete: {output_path}")
            return output_path

        except ffmpeg.Error as e:
            stderr_msg = e.stderr.decode('utf8') if e.stderr else str(e)
            logger.error(f"FFmpeg error during compositing: {stderr_msg}")
            raise RuntimeError(f"FFmpeg overlay failed: {stderr_msg}") from e

    # Run FFmpeg in executor to avoid blocking async event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _process)
    return output_path


# ─────────────────────────────────────────────────────────────────────────────
# Audio-only Strip (no overlay, just removes audio track)
# ─────────────────────────────────────────────────────────────────────────────

async def strip_audio_from_video(video_url: str, reel_id: str) -> str:
    """
    Download a video, strip its audio track with FFmpeg (-an / vcodec copy),
    and upload the silent result to R2.

    Used as a fallback when the user selects "No Audio" but the overlay step
    was skipped (no product logo / product image configured) — in that case
    Kling's generated audio would otherwise survive in the final video.

    vcodec copy means no video re-encode: fast and lossless.

    Args:
        video_url: Publicly downloadable URL (fal.ai CDN or presigned R2)
        reel_id:   Reel UUID for R2 object key naming

    Returns:
        R2 object key of the silent video
        (proxied by the backend via /api/upload/videos/{key})

    Raises:
        RuntimeError: If FFmpeg is not installed, or download/upload fails
    """
    if not _FFMPEG_AVAILABLE:
        raise RuntimeError(
            "ffmpeg not found in PATH — install FFmpeg and restart Celery worker. "
            "Windows builds: https://www.gyan.dev/ffmpeg/builds/"
        )

    video_tmp = None
    output_tmp = None

    try:
        video_tmp = await download_to_temp(video_url, suffix=".mp4")

        fd, output_tmp = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)

        def _process():
            out = ffmpeg.output(
                ffmpeg.input(video_tmp),
                output_tmp,
                vcodec="copy",  # copy video stream (no re-encode — fast)
                an=None,        # -an: remove audio track entirely
            )
            ffmpeg.run(out, overwrite_output=True, quiet=True)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _process)
        logger.info(f"[StripAudio] Audio stripped for reel {reel_id}")

        with open(output_tmp, "rb") as f:
            output_bytes = f.read()

        object_key = upload_raw_bytes_to_r2(
            data=output_bytes,
            filename=f"reel_{reel_id}_silent.mp4",
            prefix="videos/reels/silent",
            category=reel_id,
            return_key_only=True,
        )
        logger.info(f"[StripAudio] Uploaded: key={object_key}")
        return object_key

    finally:
        _cleanup_temp_files(video_tmp, output_tmp)


# ─────────────────────────────────────────────────────────────────────────────
# Main Overlay Operation (with Download + Upload + Error Handling)
# ─────────────────────────────────────────────────────────────────────────────

async def apply_overlay(
    video_url: str,
    overlay_url: str,
    position: str,
    reel_id: str,
    with_audio: bool = True,
) -> str:
    """
    Full overlay pipeline: Download video & overlay, composite, upload to R2.

    Raises on failure — callers should wrap in try/except for graceful degradation.
    Returning the object key (not the public URL) lets the frontend proxy through
    /api/upload/videos/{key} so R2 auth is never required from the browser.

    Args:
        video_url: Publicly downloadable URL to input video
                   (pass a presigned URL for R2 keys so httpx can fetch it)
        overlay_url: Public URL to overlay image (logo/product)
        position: Logo placement: 'top-left', 'top-right', 'bottom-left',
                 'bottom-right', or 'center'
        reel_id: Reel UUID for organizing output in R2
        with_audio: If True, preserve audio track; if False, strip audio (-an).

    Returns:
        R2 object key of the composited video (e.g. "videos/reels/overlaid/{reel_id}/abc.mp4")

    Raises:
        Exception: If any step (download / FFmpeg / R2 upload) fails
    """
    video_tmp = None
    overlay_tmp = None
    output_tmp = None

    try:
        # Extract overlay file extension (handle query params)
        overlay_ext = "." + overlay_url.split("?")[0].rsplit(".", 1)[-1].lower() \
            if "." in overlay_url else ".png"

        logger.info(f"[Overlay] Starting composition for reel {reel_id}")

        # Step 1: Download video and overlay in parallel
        video_tmp, overlay_tmp = await asyncio.gather(
            download_to_temp(video_url, suffix=".mp4"),
            download_to_temp(overlay_url, suffix=overlay_ext),
        )

        # Step 2: Create output temp file
        fd, output_tmp = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)

        # Step 3: Run FFmpeg overlay composition (strip audio if with_audio=False)
        await overlay_watermark(video_tmp, overlay_tmp, position, output_tmp, with_audio=with_audio)

        # Step 4: Upload composited video to R2 — store only the object key
        # so the frontend can proxy via /api/upload/videos/{key} regardless of
        # whether the R2 bucket has public access enabled.
        with open(output_tmp, 'rb') as f:
            output_bytes = f.read()

        object_key = upload_raw_bytes_to_r2(
            data=output_bytes,
            filename=f"reel_{reel_id}.mp4",
            prefix="videos/reels/overlaid",
            category=reel_id,
            return_key_only=True,  # Object key — frontend proxies through backend
        )
        logger.info(f"[Overlay] Successfully uploaded: key={object_key}")
        return object_key

    finally:
        # Always clean up temporary files (even on error)
        _cleanup_temp_files(video_tmp, overlay_tmp, output_tmp)
