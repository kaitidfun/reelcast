"""
Media Service (Legacy)
======================
This module is kept for backward compatibility. All new overlay operations
should use app.services.overlay_service instead.

For new code, import from overlay_service:
    from app.services.overlay_service import apply_overlay
"""

import os
import asyncio
import tempfile
import uuid
import logging
import ffmpeg
import httpx

logger = logging.getLogger(__name__)


async def download_to_temp(url: str, suffix: str = "") -> str:
    """
    Download a remote URL to a temporary local file.

    Args:
        url: Remote URL to download
        suffix: File extension suffix (e.g., ".mp4")

    Returns:
        Path to temporary file on disk

    Raises:
        httpx.HTTPError: If download fails (network error, 4xx/5xx status)
    """
    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        logger.debug(f"Downloaded {len(resp.content)} bytes from {url} to {path}")
        return path
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        raise


def _upload_to_r2_sync(local_path: str, reel_id: str) -> str | None:
    """
    Upload a local MP4 file to Cloudflare R2 (blocking operation).

    DEPRECATED: Use app.services.overlay_service.apply_overlay() instead.

    Args:
        local_path: Local file path to MP4 video
        reel_id: Reel ID for organizing uploads in R2

    Returns:
        Public URL to file in R2, or None if R2 not configured

    Raises:
        Exception if S3 upload fails (will be caught by caller)
    """
    import boto3
    try:
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        r2_key_id   = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret   = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_bucket   = os.getenv("R2_BUCKET_NAME")
        r2_public   = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

        if not all([r2_endpoint, r2_key_id, r2_secret, r2_bucket]):
            logger.warning("R2 not configured - skipping upload")
            return None

        s3 = boto3.client(
            "s3",
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_key_id,
            aws_secret_access_key=r2_secret,
            region_name="auto",
        )
        object_key = f"videos/reels/{reel_id}/{uuid.uuid4().hex}.mp4"
        with open(local_path, "rb") as fh:
            file_size = os.path.getsize(local_path)
            s3.put_object(Bucket=r2_bucket, Key=object_key, Body=fh, ContentType="video/mp4")
            logger.info(f"Uploaded {file_size} bytes to R2: {object_key}")

        if r2_public:
            url = f"{r2_public}/{object_key}"
        else:
            url = f"{r2_endpoint.rstrip('/')}/{r2_bucket}/{object_key}"

        return url
    except Exception as e:
        logger.error(f"R2 upload failed: {e}")
        raise


async def apply_overlay(video_url: str, overlay_url: str, position: str, reel_id: str) -> str:
    """
    Download video + overlay image, composite with FFmpeg, upload result to R2.

    DEPRECATED: Use app.services.overlay_service.apply_overlay() instead.
    This implementation lacks structured error handling. The new service has proper logging.

    Returns the new public URL, or the original video_url on any failure (graceful degradation).
    """
    video_tmp = overlay_tmp = output_tmp = None
    try:
        logger.info(f"[Overlay (legacy)] Starting for reel {reel_id}, position: {position}")
        overlay_ext = "." + overlay_url.split("?")[0].rsplit(".", 1)[-1].lower() if "." in overlay_url else ".png"

        video_tmp, overlay_tmp = await asyncio.gather(
            download_to_temp(video_url, suffix=".mp4"),
            download_to_temp(overlay_url, suffix=overlay_ext),
        )

        fd, output_tmp = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)

        await overlay_watermark(video_tmp, overlay_tmp, position, output_tmp)

        loop = asyncio.get_event_loop()
        public_url = await loop.run_in_executor(None, _upload_to_r2_sync, output_tmp, reel_id)
        logger.info(f"[Overlay (legacy)] Done → {public_url or 'R2 not configured, keeping original'}")
        return public_url or video_url

    except Exception as e:
        logger.warning(f"[Overlay (legacy)] Failed, keeping original video: {e}")
        return video_url
    finally:
        for tmp in [video_tmp, overlay_tmp, output_tmp]:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                    logger.debug(f"Cleaned up temp file: {tmp}")
                except OSError as e:
                    logger.warning(f"Failed to remove temp file {tmp}: {e}")


async def overlay_watermark(video_path: str, overlay_path: str, position: str, output_path: str) -> str:
    """
    Composite an overlay image onto a video using FFmpeg (blocking operation).

    DEPRECATED: Use app.services.overlay_service.overlay_watermark() instead.

    Overlay image is scaled to max 150px width to prevent covering video content
    while maintaining logo visibility.

    Args:
        video_path: Local path to input video file
        overlay_path: Local path to overlay image (PNG/JPG)
        position: Placement - 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'
                 (defaults to 'bottom-right' if unknown)
        output_path: Local path for output MP4 file

    Returns:
        Path to composited output file

    Raises:
        ffmpeg.Error: If FFmpeg compositing fails
    """
    # Map position to FFmpeg coordinate expressions
    position_map = {
        'top-left': ('10', '10'),
        'top-right': ('main_w-overlay_w-10', '10'),
        'bottom-left': ('10', 'main_h-overlay_h-10'),
        'bottom-right': ('main_w-overlay_w-10', 'main_h-overlay_h-10'),
        'center': ('(main_w-overlay_w)/2', '(main_h-overlay_h)/2'),
    }
    overlay_x, overlay_y = position_map.get(position, position_map['bottom-right'])
    logger.debug(f"Overlay position '{position}' → x={overlay_x}, y={overlay_y}")

    def _process():
        try:
            input_video = ffmpeg.input(video_path)
            input_overlay = ffmpeg.input(overlay_path)

            # Scale overlay to max 150px width (preserves aspect ratio with -1 height)
            # This prevents logo from obscuring video content while maintaining visibility
            input_overlay = ffmpeg.filter(input_overlay, 'scale', 150, -1)

            # Composite overlay at specified position
            overlaid = ffmpeg.overlay(input_video, input_overlay, x=overlay_x, y=overlay_y)

            # Output as H.264 MP4 for broad device compatibility
            out = ffmpeg.output(
                overlaid,
                input_video.audio,  # Preserve original audio if present
                output_path,
                vcodec='libx264',
                acodec='aac',
                strict='experimental'
            )

            logger.debug(f"Running FFmpeg: {video_path} + {overlay_path} → {output_path}")
            ffmpeg.run(out, overwrite_output=True, quiet=True)
            logger.info(f"FFmpeg compositing complete: {output_path}")
            return output_path
        except ffmpeg.Error as e:
            error_msg = e.stderr.decode('utf8') if e.stderr else str(e)
            logger.error(f"FFmpeg error during compositing: {error_msg}")
            raise

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _process)
    return output_path
