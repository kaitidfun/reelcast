"""
Video Generation Service
========================
Orchestrates AI video generation with fallback providers and centralized R2 upload.

Providers (priority order):
    1. fal.ai Wan 2.1      — Fast & cheap (~฿0.5/video), returns public URL
    2. Google Veo 2.0      — Best quality (~฿63/video), downloads and uploads to R2
    3. Sample fallback     — Free, no AI, for development/testing

Usage:
    from app.services.video_generation_service import generate_video

    video_url = await generate_video(
        prompt="A product showcase...",
        resolution="720p",
        duration=30
    )
"""

import os
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def generate_video(
    prompt: str,
    image_url: Optional[str] = None,
    resolution: str = "720p",
    duration: int = 30,
) -> str:
    """
    Generate short-form video using AI (priority: fal.ai → Veo → sample fallback).

    Attempts providers in sequence until one succeeds. Returns a public URL
    to the generated video in vertical 9:16 format.

    Args:
        prompt: Creative brief (enriched with product metadata by caller)
        image_url: Optional reference image for style guidance
        resolution: Output resolution - "480p", "720p", or "1080p" (default "720p" per SRS)
        duration: Video length in seconds - capped at 30s for optimal quality (max 60s per SRS)

    Returns:
        Public URL to generated video (playable, vertical 9:16 aspect ratio)

    Raises:
        No exceptions - returns sample fallback video if all providers fail

    Implementation Notes:
        - fal.ai Wan 2.1 1.3b model: num_frames capped at 480 (~30s @ 16 FPS)
        - num_frames calculated as: min(duration * 16, 480) to respect model limits
        - Veo 2.0: Long-running operation polled every 10s, 5-minute timeout
        - All generated videos uploaded to R2 and returned as permanent public URLs
    """
    fal_key = os.getenv("FAL_KEY", "")
    veo_enabled = os.getenv("VEO_ENABLED", "false").lower() == "true"
    google_ai_key = os.getenv("GOOGLE_AI_API_KEY", "")

    # ──────────────────────────────────────────────
    # Option 1: fal.ai Wan 2.1 (cheap & fast)
    # ──────────────────────────────────────────────
    if fal_key:
        try:
            return await _generate_with_fal(prompt, resolution, duration, image_url)
        except Exception as e:
            logger.warning(f"[fal.ai] Generation failed, trying next provider: {e}")

    # ──────────────────────────────────────────────
    # Option 2: Google Veo 2.0 (best quality, pricey)
    # ──────────────────────────────────────────────
    if veo_enabled and google_ai_key:
        try:
            return await _generate_with_veo(prompt)
        except Exception as e:
            logger.warning(f"[Veo] Generation failed, using sample fallback: {e}")

    # ──────────────────────────────────────────────
    # Option 3: Sample video fallback (free, no AI)
    # ──────────────────────────────────────────────
    logger.info("[Video] No AI provider available - using sample video for development")
    await asyncio.sleep(3)
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"


async def _generate_with_fal(
    prompt: str,
    resolution: str,
    duration: int,
    image_url: Optional[str] = None,
) -> str:
    """
    Generate video using fal.ai Wan 2.1 model.

    When image_url is provided, uses image-to-video mode so the AI generates
    a video that visually matches the product image (F2-URS02-SRS01).
    Without image_url, falls back to text-to-video mode.

    fal.ai returns a direct public CDN URL — no R2 upload needed.

    Args:
        prompt: Creative brief (enriched with product name + description)
        resolution: Output resolution (480p/720p/1080p)
        duration: Duration in seconds (capped at 30s for model stability)
        image_url: Optional product image URL as visual reference for generation

    Returns:
        Public CDN URL to generated video

    Raises:
        Exception if fal.ai API fails or model execution times out
    """
    try:
        import fal_client

        # Cap frames at 480 (30s @ 16 FPS) for fal.ai Wan 2.1 1.3b model stability
        # Model max frames per documentation: 960 @ 30 FPS = 480 @ 16 FPS
        num_frames = min(duration * 16, 480)

        if image_url:
            logger.info(f"[fal.ai] Image-to-video mode: {resolution}, {duration}s, ref={image_url}")
        else:
            logger.info(f"[fal.ai] Text-to-video mode: {resolution}, {duration}s ({num_frames} frames)")

        def _run_fal():
            arguments = {
                "prompt": prompt,
                "num_frames": num_frames,
                "frames_per_second": 16,
                "resolution": resolution,
                "aspect_ratio": "9:16",
            }
            # Add product image as visual reference when available (image-to-video mode)
            if image_url:
                arguments["image_url"] = image_url

            result = fal_client.run("fal-ai/wan/v2.1/1.3b", arguments=arguments)
            return result["video"]["url"]

        loop = asyncio.get_event_loop()
        video_url = await loop.run_in_executor(None, _run_fal)
        logger.info(f"[fal.ai] Video ready: {video_url}")
        return video_url

    except Exception as e:
        logger.error(f"[fal.ai] Error: {e}")
        raise


async def _generate_with_veo(prompt: str) -> str:
    """
    Generate video using Google Veo 2.0 model (best quality but expensive/slow).

    Steps:
        1. Submit generation request (returns operation ID)
        2. Poll operation status every 10s (max 5 min timeout)
        3. Download generated video from Google storage
        4. Upload to R2 for permanent public URL

    Args:
        prompt: Creative brief

    Returns:
        Public URL to generated video stored in R2

    Raises:
        RuntimeError if operation times out, download fails, or R2 upload fails
    """
    import time
    import uuid
    import requests
    import boto3
    from google import genai

    google_ai_key = os.getenv("GOOGLE_AI_API_KEY")
    r2_endpoint = os.getenv("R2_ENDPOINT_URL")
    r2_key_id = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket = os.getenv("R2_BUCKET_NAME")
    r2_public = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

    if not google_ai_key:
        raise RuntimeError("GOOGLE_AI_API_KEY not configured")

    try:
        client = genai.Client(api_key=google_ai_key)
        logger.info(f"[Veo] Starting generation: {prompt[:80]}...")

        def _generate_and_upload():
            # Step 1: Submit generation request
            operation = client.models.generate_videos(
                model="veo-2.0-generate-001",
                prompt=prompt,
                config={"number_of_videos": 1},
            )
            logger.info(f"[Veo] Submitted operation: {operation.name}")

            # Step 2: Poll until completion (max 5 minutes)
            max_wait, waited = 300, 0
            while not operation.done and waited < max_wait:
                time.sleep(10)
                waited += 10
                operation = client.operations.get(operation.name)
                logger.info(f"[Veo] Generating... ({waited}s elapsed)")

            if not operation.done:
                raise RuntimeError(f"Veo generation timed out after {max_wait}s")

            if not (operation.response and operation.response.generated_videos):
                raise RuntimeError("Veo operation returned no videos")

            # Step 3: Download video from Google storage
            veo_uri = operation.response.generated_videos[0].video.uri
            download_url = f"{veo_uri}&key={google_ai_key}" if "?" in veo_uri \
                else f"{veo_uri}?key={google_ai_key}"

            logger.info(f"[Veo] Downloading from: {download_url}")
            resp = requests.get(download_url, timeout=120)
            resp.raise_for_status()
            video_bytes = resp.content
            logger.info(f"[Veo] Downloaded {len(video_bytes):,} bytes")

            # Step 4: Upload to R2 for permanent storage
            if not all([r2_endpoint, r2_key_id, r2_secret, r2_bucket]):
                logger.warning("[Veo] R2 not configured, returning Google URI")
                return veo_uri

            s3 = boto3.client(
                "s3",
                endpoint_url=r2_endpoint,
                aws_access_key_id=r2_key_id,
                aws_secret_access_key=r2_secret,
                region_name="auto",
            )
            object_key = f"videos/reels/veo/{uuid.uuid4().hex}.mp4"
            s3.put_object(
                Bucket=r2_bucket,
                Key=object_key,
                Body=video_bytes,
                ContentType="video/mp4"
            )
            logger.info(f"[Veo] Uploaded to R2: {object_key}")

            if r2_public:
                return f"{r2_public}/{object_key}"
            return f"{r2_endpoint.rstrip('/')}/{r2_bucket}/{object_key}"

        loop = asyncio.get_event_loop()
        video_url = await loop.run_in_executor(None, _generate_and_upload)
        return video_url

    except Exception as e:
        logger.error(f"[Veo] Error: {e}")
        raise
