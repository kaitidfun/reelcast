"""
FFmpeg Overlay Service
======================
Handles video overlay operations with product images, logos, and watermarks.
Supports configurable positioning and graceful fallback on errors.

Usage:
    from app.services.overlay_service import overlayImagesAndLogos

    new_url = await overlayImagesAndLogos(
        video_url="https://...",
        overlay_url="https://...",
        position="bottom-right",
        reel_id="abc-123"
    )
"""

import os
import asyncio
import subprocess
import tempfile
import logging
from typing import Optional

import httpx
import imageio_ffmpeg

from app.services.storage_service import upload_raw_bytes_to_r2
from app.exceptions import FFmpegProcessingException, InvalidCoordinateException

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# FFmpeg binary path (from imageio-ffmpeg bundle — no system install required)
# ─────────────────────────────────────────────────────────────────────────────
# imageio-ffmpeg ships a static ffmpeg binary as a Python package dependency.
# This means overlay/audio-strip work on any OS without the developer needing
# to install ffmpeg separately or configure PATH.
_FFMPEG_EXE: str = imageio_ffmpeg.get_ffmpeg_exe()
logger.debug(f"[Overlay] Using ffmpeg binary: {_FFMPEG_EXE}")

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
    Composite an overlay image onto a video using FFmpeg via subprocess.

    Uses -map 0:a? (optional audio) to preserve audio when present without
    requiring a separate ffprobe check — ffprobe is not bundled by imageio_ffmpeg.

    Args:
        video_path: Local path to input video file
        overlay_path: Local path to overlay image (PNG/JPG/WEBP)
        position: Placement option - 'top-left', 'top-right', 'bottom-left',
                 'bottom-right', or 'center'
        output_path: Local path for output MP4 file
        with_audio: If True, preserve original audio track. If False, strip audio.

    Returns:
        Path to output MP4 file

    Raises:
        RuntimeError: If FFmpeg compositing fails
    """
    if position not in POSITION_COORDS:
        raise InvalidCoordinateException(
            f"Unsupported overlay position '{position}'"
        )
    overlay_x, overlay_y = POSITION_COORDS[position]
    logger.info(f"Compositing overlay at position '{position}': {overlay_path} (audio={'on' if with_audio else 'stripped'})")

    def _process():
        # Scale overlay to max width then composite onto video
        filtergraph = (
            f"[1:v]scale={OVERLAY_MAX_WIDTH}:-1[logo];"
            f"[0:v][logo]overlay=x={overlay_x}:y={overlay_y}[out]"
        )
        cmd = [
            _FFMPEG_EXE,
            "-i", video_path,
            "-i", overlay_path,
            "-filter_complex", filtergraph,
            "-map", "[out]",
        ]
        if with_audio:
            # -map 0:a? : include audio stream from input 0 if it exists;
            # silently skipped when the clip has no audio track (no ffprobe needed).
            cmd += ["-map", "0:a?", "-c:a", "aac", "-strict", "experimental"]
        else:
            cmd += ["-an"]
        cmd += ["-c:v", "libx264", "-y", output_path]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=120)
            if result.returncode != 0:
                stderr_msg = result.stderr.decode("utf-8", errors="replace")
                logger.error(f"FFmpeg error during compositing: {stderr_msg}")
                raise FFmpegProcessingException(stderr_msg)
            logger.info(f"FFmpeg compositing complete: {output_path}")
            return output_path
        except subprocess.TimeoutExpired as e:
            raise FFmpegProcessingException(
                "FFmpeg overlay timed out after 120 seconds"
            ) from e

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _process)
    return output_path


# ─────────────────────────────────────────────────────────────────────────────
# Main Overlay Operation (with Download + Upload + Error Handling)
# ─────────────────────────────────────────────────────────────────────────────

async def overlayImagesAndLogos(
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
