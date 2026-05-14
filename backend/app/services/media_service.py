import os
import asyncio
import tempfile
import uuid
import ffmpeg
import httpx


async def download_to_temp(url: str, suffix: str = "") -> str:
    """Download a remote URL to a temp local file, return its path."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(resp.content)
    return path


def _upload_to_r2_sync(local_path: str, reel_id: str) -> str | None:
    """Upload a local MP4 file to Cloudflare R2, return its public URL (or None if R2 not configured)."""
    import boto3
    r2_endpoint = os.getenv("R2_ENDPOINT_URL")
    r2_key_id   = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret   = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket   = os.getenv("R2_BUCKET_NAME")
    r2_public   = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

    if not all([r2_endpoint, r2_key_id, r2_secret, r2_bucket]):
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
        s3.put_object(Bucket=r2_bucket, Key=object_key, Body=fh, ContentType="video/mp4")

    if r2_public:
        return f"{r2_public}/{object_key}"
    return f"{r2_endpoint.rstrip('/')}/{r2_bucket}/{object_key}"


async def apply_overlay(video_url: str, overlay_url: str, position: str, reel_id: str) -> str:
    """
    Download video + overlay image, composite with FFmpeg, upload result to R2.
    Returns the new public URL, or the original video_url on any failure.
    """
    video_tmp = overlay_tmp = output_tmp = None
    try:
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
        print(f"[Overlay] Done → {public_url or 'R2 not configured, keeping original'}")
        return public_url or video_url

    except Exception as e:
        print(f"[Overlay] Failed, keeping original video: {e}")
        return video_url
    finally:
        for tmp in [video_tmp, overlay_tmp, output_tmp]:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


async def overlay_watermark(video_path: str, overlay_path: str, position: str, output_path: str) -> str:
    """
    Overlay an image (logo or product) onto a video using FFmpeg.
    Position can be 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'.
    """
    # Calculate position coordinates
    if position == 'top-left':
        overlay_x = '10'
        overlay_y = '10'
    elif position == 'top-right':
        overlay_x = 'main_w-overlay_w-10'
        overlay_y = '10'
    elif position == 'bottom-left':
        overlay_x = '10'
        overlay_y = 'main_h-overlay_h-10'
    elif position == 'bottom-right':
        overlay_x = 'main_w-overlay_w-10'
        overlay_y = 'main_h-overlay_h-10'
    elif position == 'center':
        overlay_x = '(main_w-overlay_w)/2'
        overlay_y = '(main_h-overlay_h)/2'
    else:
        # Default to bottom-right
        overlay_x = 'main_w-overlay_w-10'
        overlay_y = 'main_h-overlay_h-10'

    def _process():
        try:
            input_video = ffmpeg.input(video_path)
            input_overlay = ffmpeg.input(overlay_path)
            
            # Scale overlay (e.g., max width 150px, keep aspect ratio)
            input_overlay = ffmpeg.filter(input_overlay, 'scale', 150, -1)
            
            # Apply overlay
            overlaid = ffmpeg.overlay(input_video, input_overlay, x=overlay_x, y=overlay_y)
            
            # Output as H.264 MP4 to meet broad compatibility requirements
            out = ffmpeg.output(
                overlaid,
                input_video.audio, # Preserve audio if any
                output_path,
                vcodec='libx264',
                acodec='aac',
                strict='experimental'
            )
            
            ffmpeg.run(out, overwrite_output=True, quiet=True)
            return output_path
        except ffmpeg.Error as e:
            print(f"FFmpeg error: {e.stderr.decode('utf8')}")
            raise

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _process)
    return output_path
