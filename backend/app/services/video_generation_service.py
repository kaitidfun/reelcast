"""
Video Generation Service
========================
Handles AI video generation via Kling Video 2.6 Pro (fal.ai).

Primary Pipeline (when product image is available):
    1. Flux Dev img2img → creative first frame from product photo + prompt
    2. Kling 2.6 Pro image-to-video → animate the Flux first frame

    WHY two-step:
    - Raw product photos (plain white background) produce boring animations
    - Flux creates a proper scene/environment around the product first
    - Kling then animates that scene → cinematic product reel

    WHY Flux img2img (not text-only):
    - img2img preserves product appearance better than generating from text
    - strength=0.75 → 75% creative from prompt, 25% faithful to product photo
    - Product silhouette/shape/color mostly preserved while scene is generated

Fallback Pipeline (when no product image):
    Kling 2.6 Pro text-to-video → scene from prompt only

Duration handling:
    ≤ 10s → single Kling call
    > 10s → chained clips (last frame of clip N = first frame of clip N+1)
             then FFmpeg concat → R2 upload

Providers (priority order):
    1. fal.ai Flux Dev + Kling 2.6 Pro  — primary
    2. Google Veo 2.0                   — quality fallback (slow, expensive)
    3. Sample video                     — free fallback for dev/CI
"""

import os
import math
import asyncio
import tempfile
import logging
from typing import Optional

import ffmpeg
import httpx

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Model Constants
# ─────────────────────────────────────────────────────────────────────────────

# Kling 2.6 Pro — two modes selected based on whether a product image is available
KLING26_TEXT_MODEL  = "fal-ai/kling-video/v2.6/pro/text-to-video"
KLING26_IMAGE_MODEL = "fal-ai/kling-video/v2.6/pro/image-to-video"

# Flux General + IP-Adapter — reference-based image generation.
# Unlike img2img (pixel transformation), IP-Adapter extracts the product's
# "visual identity" (shape, colour, texture) and injects it into a freshly
# generated scene described by the text prompt.
# Supports MULTIPLE reference images — each product photo is a separate
# IP-Adapter entry, so Flux sees every angle/view of the product.
FLUX_GENERAL_MODEL = "fal-ai/flux-general"

# Total IP-Adapter influence weight distributed equally across all product images.
# 0.75 = strong product identity reference while still following the scene prompt.
# Lowered automatically when more images are used to avoid over-constraining.
FLUX_IP_TOTAL_WEIGHT = 0.75


# ─────────────────────────────────────────────────────────────────────────────
# Duration helper
# ─────────────────────────────────────────────────────────────────────────────

def _snap_to_kling_duration(seconds: int) -> str:
    """Snap duration to Kling's supported values: '5' or '10' (string required by fal.ai).

    Kling 2.6 Pro accepts exactly two clip lengths per API call.
    For longer target durations (15s, 30s, 60s) the caller should use
    generate_extended_kling26() which chains multiple 10s clips.
    """
    return "5" if seconds <= 5 else "10"


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers for extend chain
# ─────────────────────────────────────────────────────────────────────────────

def _cleanup_temp(*paths: Optional[str]) -> None:
    """Safely remove temporary files — logs errors, never raises."""
    for p in paths:
        if p:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except OSError as e:
                logger.warning(f"[Temp] Could not remove {p}: {e}")


async def _extract_last_frame(video_url: str) -> str:
    """
    Download a video clip, extract its last frame with FFmpeg, and upload
    the frame to fal.ai storage so it can be used as the first-frame anchor
    for the next Kling clip in the extend chain.

    Args:
        video_url: Publicly accessible URL (fal.ai CDN or presigned R2)

    Returns:
        fal.ai storage URL of the extracted JPEG frame

    Raises:
        RuntimeError: If download, FFmpeg extraction, or fal upload fails
    """
    import fal_client

    video_tmp: Optional[str] = None
    frame_tmp: Optional[str] = None

    try:
        # ── 1. Download video ────────────────────────────────────────────────
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(video_url)
            resp.raise_for_status()

        fd, video_tmp = tempfile.mkstemp(suffix=".mp4")
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        logger.info(f"[Extend] Downloaded video ({len(resp.content):,} bytes) → {video_tmp}")

        # ── 2. Probe duration to compute seek position ───────────────────────
        def _probe():
            return ffmpeg.probe(video_tmp)

        loop = asyncio.get_event_loop()
        probe_data = await loop.run_in_executor(None, _probe)
        vid_duration = float(probe_data["format"].get("duration", 0))
        seek_time = max(0.0, vid_duration - 0.05)  # 50 ms before end = last frame

        # ── 3. Extract frame with FFmpeg ─────────────────────────────────────
        fd, frame_tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)

        def _extract():
            (
                ffmpeg
                .input(video_tmp, ss=seek_time)
                .output(frame_tmp, vframes=1, **{"f": "image2", "vcodec": "mjpeg"})
                .run(quiet=True, overwrite_output=True)
            )

        await loop.run_in_executor(None, _extract)
        logger.info(f"[Extend] Last frame at t={seek_time:.3f}s → {frame_tmp}")

        # ── 4. Upload frame to fal.ai (returns a public CDN URL) ─────────────
        def _upload():
            return fal_client.upload_file(frame_tmp)

        frame_url: str = await loop.run_in_executor(None, _upload)
        logger.info(f"[Extend] Frame uploaded: {frame_url}")
        return frame_url

    except Exception as e:
        logger.error(f"[Extend] Frame extraction failed: {e}")
        raise RuntimeError(f"Could not extract last frame: {e}") from e
    finally:
        _cleanup_temp(video_tmp, frame_tmp)


async def _concat_clips(clip_urls: list[str], reel_id: str) -> str:
    """
    Download all clip URLs, concatenate with FFmpeg stream copy (no re-encode),
    and upload the result to R2.

    Using 'stream copy' means the codec is not touched — fast and lossless.
    All clips must have the same codec / resolution (guaranteed since they all
    come from the same Kling 2.6 Pro configuration).

    Args:
        clip_urls: Ordered list of clip URLs (fal.ai CDN)
        reel_id:   Reel UUID — used for the R2 object key

    Returns:
        R2 object key of the concatenated video
        (proxied by the backend via /api/upload/videos/{key})

    Raises:
        RuntimeError: If any download, FFmpeg concat, or R2 upload fails
    """
    from app.services.storage_service import upload_raw_bytes_to_r2

    clip_paths: list[str] = []
    list_path: Optional[str] = None
    output_path: Optional[str] = None

    try:
        # ── 1. Download all clips in parallel ────────────────────────────────
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            responses = await asyncio.gather(*[client.get(u) for u in clip_urls])

        for i, resp in enumerate(responses):
            resp.raise_for_status()
            fd, path = tempfile.mkstemp(suffix=f"_clip{i}.mp4")
            with os.fdopen(fd, "wb") as f:
                f.write(resp.content)
            clip_paths.append(path)

        logger.info(f"[Concat] Downloaded {len(clip_paths)} clips")

        # ── 2. Write FFmpeg concat list file ─────────────────────────────────
        fd, list_path = tempfile.mkstemp(suffix="_concat.txt")
        with os.fdopen(fd, "w") as f:
            for p in clip_paths:
                safe = p.replace("'", "'\\''")  # escape single quotes in path
                f.write(f"file '{safe}'\n")

        # ── 3. Concatenate with FFmpeg (stream copy — no re-encode) ──────────
        fd, output_path = tempfile.mkstemp(suffix="_extended.mp4")
        os.close(fd)

        def _concat():
            (
                ffmpeg
                .input(list_path, format="concat", safe=0)
                .output(output_path, c="copy")
                .run(quiet=True, overwrite_output=True)
            )

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _concat)
        logger.info(f"[Concat] Concatenation complete: {output_path}")

        # ── 4. Upload to R2 ──────────────────────────────────────────────────
        with open(output_path, "rb") as f:
            data = f.read()

        key = upload_raw_bytes_to_r2(
            data=data,
            filename=f"reel_{reel_id}_extended.mp4",
            prefix="videos/reels/extended",
            category=reel_id,
            return_key_only=True,
        )
        logger.info(f"[Concat] Uploaded to R2: key={key}")
        return key  # R2 object key — frontend proxies via /api/upload/videos/{key}

    except Exception as e:
        logger.error(f"[Concat] Failed: {e}")
        raise RuntimeError(f"Video concatenation failed: {e}") from e
    finally:
        _cleanup_temp(*clip_paths, list_path, output_path)


# ─────────────────────────────────────────────────────────────────────────────
# Flux Dev — First Frame Generator
# ─────────────────────────────────────────────────────────────────────────────

async def generate_first_frame_with_flux(
    prompt: str,
    product_image_urls: list[str],
    ip_weight: float = FLUX_IP_TOTAL_WEIGHT,
) -> str:
    """
    Generate a creative first frame using Flux General + IP-Adapter.

    IP-Adapter extracts the product's visual identity (shape, colour, texture)
    from ALL provided product photos and injects that identity into a new scene
    described by the text prompt — without pixel-transforming any single image.

    Why multiple images:
        Sending all product photos (front, back, side, detail) lets Flux see
        the full product from every angle, producing a more accurate and
        recognisable result than using only one reference photo.

    Weight distribution:
        Total IP-Adapter weight is fixed at FLUX_IP_TOTAL_WEIGHT (0.75) and
        divided equally across all images so no single angle dominates.
        e.g. 3 images → 0.25 each; 1 image → 0.75.

    Args:
        prompt:              Scene description — focus on environment, action,
                             people, atmosphere. Do NOT describe product appearance;
                             the IP-Adapter reference handles that.
        product_image_urls:  All product image URLs (presigned R2 or public CDN).
                             At least 1 required.
        ip_weight:           Total IP-Adapter influence (0.30–0.80).
                             Auto-scored by score_prompt_fidelity() in worker —
                             low = surreal/creative, high = product-realistic.

    Returns:
        fal.media CDN URL of the Flux-generated first frame image.

    Raises:
        ValueError:   If product_image_urls is empty.
        RuntimeError: If fal.ai API call fails.
    """
    if not product_image_urls:
        raise ValueError("At least one product image URL is required for Flux generation")

    try:
        import fal_client

        # Distribute total weight equally across all product images
        per_image_weight = round(ip_weight / len(product_image_urls), 3)

        logger.info(
            f"[Flux] Generating first frame via IP-Adapter "
            f"({len(product_image_urls)} image(s), "
            f"total_weight={ip_weight}, per_image={per_image_weight}): "
            f"{prompt[:60]}..."
        )

        def _run():
            result = fal_client.run(
                FLUX_GENERAL_MODEL,
                arguments={
                    "prompt": prompt,
                    "image_size": "portrait_9_16",  # 9:16 — matches Kling output aspect ratio
                    "num_inference_steps": 28,
                    "guidance_scale": 3.5,
                    "num_images": 1,
                    "enable_safety_checker": True,
                    # IP-Adapter: one entry per product image.
                    # NOTE: fal-ai/flux-general parameter name confirmed as "ip_adapters"
                    # (array). If this call fails with parameter error, check fal.ai docs
                    # at https://fal.ai/models/fal-ai/flux-general for current schema.
                    "ip_adapters": [
                        {
                            "ip_adapter_image_url": url,
                            "weight": per_image_weight,
                        }
                        for url in product_image_urls
                    ],
                },
            )
            # flux-general response: {"images": [{"url": "...", "width": int, "height": int}]}
            # Defensive access — raises RuntimeError with clear message if structure unexpected
            images = result.get("images") or []
            if not images:
                raise RuntimeError(
                    f"Flux returned no images. Full response: {result}"
                )
            url = images[0].get("url")
            if not url:
                raise RuntimeError(
                    f"Flux image missing 'url' field. Entry: {images[0]}"
                )
            return url

        loop = asyncio.get_running_loop()
        url = await loop.run_in_executor(None, _run)
        logger.info(f"[Flux] First frame ready: {url}")
        return url

    except Exception as e:
        logger.error(f"[Flux] First frame generation failed: {e}")
        raise RuntimeError(f"Flux first frame generation failed: {e}") from e


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def generate_with_kling26(
    prompt: str,
    image_url: Optional[str] = None,
    duration: int = 5,
    with_audio: bool = False,
) -> str:
    """
    Generate a SINGLE video clip using Kling Video 2.6 Pro (fal.ai).

    Duration is capped at 10s per call.
    For longer videos use generate_extended_kling26() which chains clips.

    Mode selection:
        With image_url  → fal-ai/kling-video/v2.6/pro/image-to-video
            Product photo anchors the first frame; Kling animates it naturally
            (rotation, camera drift, lighting effects).  The prompt guides the
            motion direction and environment atmosphere.
        Without image   → fal-ai/kling-video/v2.6/pro/text-to-video
            Scene described entirely from the text prompt.

    Args:
        prompt:     Scene description with camera movement + subject motion cues
                    (produced by Gemini — see ai_service.py system prompts)
        image_url:  Presigned/public product image URL (None → text-to-video)
        duration:   Requested clip length in seconds — snapped to "5" or "10"
        with_audio: Not sent to Kling API; audio control is handled in the
                    FFmpeg overlay step (overlay_service.py with_audio flag)

    Returns:
        Public CDN URL (fal.media) of the generated clip

    Raises:
        RuntimeError: If fal.ai API call fails
    """
    try:
        import fal_client

        kling_duration = _snap_to_kling_duration(duration)

        if image_url:
            model = KLING26_IMAGE_MODEL
            arguments: dict = {
                "prompt": prompt,
                "image_url": image_url,
                "duration": kling_duration,   # "5" or "10" — string required by fal.ai
                "aspect_ratio": "9:16",        # Portrait format for social media
            }
            logger.info(f"[Kling2.6Pro] image-to-video ({kling_duration}s): {image_url[:80]}")
        else:
            model = KLING26_TEXT_MODEL
            arguments = {
                "prompt": prompt,
                "duration": kling_duration,
                "aspect_ratio": "9:16",
            }
            logger.info(f"[Kling2.6Pro] text-to-video ({kling_duration}s)")

        def _run():
            result = fal_client.run(model, arguments=arguments)
            # fal.ai Kling response: {"video": {"url": "https://fal.media/...mp4"}}
            return result["video"]["url"]

        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(None, _run)
        logger.info(f"[Kling2.6Pro] Done: {url}")
        return url

    except Exception as e:
        logger.error(f"[Kling2.6Pro] Failed: {e}")
        raise RuntimeError(f"Kling 2.6 Pro generation failed: {e}") from e


async def generate_extended_kling26(
    prompt: str,
    image_url: Optional[str],
    total_duration: int,
    with_audio: bool = False,
    reel_id: str = "unknown",
) -> str:
    """
    Generate a long-form video (> 10s) by chaining multiple Kling 2.6 Pro clips.

    Each clip after the first starts from the LAST FRAME of the previous one —
    extracted with FFmpeg and uploaded to fal.ai storage — so the camera angle
    and scene flow seamlessly between clips.

    Example for 30s:
        Clip 1 (10s): product_image → Kling 2.6 Pro
        Clip 2 (10s): last_frame(clip1) → Kling 2.6 Pro
        Clip 3 (10s): last_frame(clip2) → Kling 2.6 Pro
        ↓ FFmpeg concat → 30s video → R2 upload → object key returned

    Args:
        prompt:         Same scene description used for all clips
        image_url:      Initial product image for clip 1 (None → text-to-video)
        total_duration: Target duration in seconds (15 / 30 / 60)
        with_audio:     Passed to downstream audio control (not sent to Kling API)
        reel_id:        Reel UUID used for R2 key naming of the concatenated output

    Returns:
        - Single fal.ai CDN URL if total_duration ≤ 10 (or only 1 clip generated)
        - R2 object key if multiple clips were concatenated
          (proxied by /api/upload/videos/{key})

    Raises:
        RuntimeError: If any clip generation or concatenation fails
    """
    clip_duration = 10  # max seconds per Kling call
    num_clips = math.ceil(total_duration / clip_duration)
    logger.info(
        f"[Kling-Extend] {total_duration}s target → {num_clips} clips × {clip_duration}s"
    )

    clip_urls: list[str] = []
    current_image_url = image_url  # Clip 1 uses product image; subsequent = last frame

    for i in range(num_clips):
        remaining = total_duration - i * clip_duration
        this_duration = min(clip_duration, remaining)

        logger.info(f"[Kling-Extend] Generating clip {i+1}/{num_clips} ({this_duration}s)")
        clip_url = await generate_with_kling26(
            prompt=prompt,
            image_url=current_image_url,
            duration=this_duration,
            with_audio=with_audio,
        )
        clip_urls.append(clip_url)

        # Extract last frame to anchor the next clip (skip for the final clip)
        if i < num_clips - 1:
            try:
                current_image_url = await _extract_last_frame(clip_url)
            except RuntimeError as exc:
                # Frame extraction failed — reuse the same image for continuity
                # (less seamless but still functional)
                logger.warning(
                    f"[Kling-Extend] Frame extraction failed for clip {i+1}, "
                    f"reusing previous image: {exc}"
                )

    # Single clip → return CDN URL directly (no concat overhead)
    if len(clip_urls) == 1:
        logger.info("[Kling-Extend] Single clip — skipping concat step")
        return clip_urls[0]

    # Multiple clips → FFmpeg concat → R2 upload → object key
    return await _concat_clips(clip_urls, reel_id)


# ─────────────────────────────────────────────────────────────────────────────
# Backward-compatible facade
# ─────────────────────────────────────────────────────────────────────────────

async def generate_video(
    prompt: str,
    image_url: Optional[str] = None,
    resolution: str = "720p",
    duration: int = 10,
) -> str:
    """
    Generate a video using the best available provider (Kling → Veo → sample).

    Used by the worker as a fallback when FAL_KEY is not configured.
    For the primary worker flow see _run_kling_generation() in worker.py.

    Args:
        prompt:     Creative brief (enriched with product metadata)
        image_url:  Product image URL for visual reference
        resolution: Ignored (aspect_ratio controls format)
        duration:   Clip length in seconds — passed to Kling (5 or 10)

    Returns:
        Public URL to the generated video
    """
    fal_key = os.getenv("FAL_KEY", "")
    veo_enabled = os.getenv("VEO_ENABLED", "false").lower() == "true"
    google_ai_key = os.getenv("GOOGLE_AI_API_KEY", "")

    # ── Option 1: Kling 2.6 Pro via fal.ai (primary)
    if fal_key:
        try:
            return await generate_with_kling26(prompt, image_url, duration)
        except Exception as e:
            logger.warning(f"[Kling2.6Pro] Failed, trying Veo: {e}")

    # ── Option 2: Google Veo 2.0 (best quality, expensive / slow)
    if veo_enabled and google_ai_key:
        try:
            return await _generate_with_veo(prompt)
        except Exception as e:
            logger.warning(f"[Veo] Failed, using sample fallback: {e}")

    # ── Option 3: Sample video (free, development / CI only)
    logger.info("[Video] No AI provider available — using sample video")
    await asyncio.sleep(3)
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"


# ─────────────────────────────────────────────────────────────────────────────
# Veo 2.0 (quality fallback — not the primary path)
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_with_veo(prompt: str) -> str:
    """
    Generate video using Google Veo 2.0 (best quality but slow / expensive).

    Steps:
        1. Submit generation request (returns operation ID)
        2. Poll every 10s (max 5 min timeout)
        3. Download video from Google storage
        4. Upload to R2 for a permanent URL

    Args:
        prompt: Creative brief

    Returns:
        Public URL to the generated video (R2 or Google URI fallback)

    Raises:
        RuntimeError: If operation times out, download fails, or R2 upload fails
    """
    import time
    import uuid
    import requests
    import boto3
    from google import genai

    google_ai_key = os.getenv("GOOGLE_AI_API_KEY")
    r2_endpoint   = os.getenv("R2_ENDPOINT_URL")
    r2_key_id     = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret     = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket     = os.getenv("R2_BUCKET_NAME")
    r2_public     = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

    if not google_ai_key:
        raise RuntimeError("GOOGLE_AI_API_KEY not configured")

    try:
        client = genai.Client(api_key=google_ai_key)
        logger.info(f"[Veo] Starting generation: {prompt[:80]}...")

        def _generate_and_upload():
            operation = client.models.generate_videos(
                model="veo-2.0-generate-001",
                prompt=prompt,
                config={"number_of_videos": 1},
            )
            logger.info(f"[Veo] Submitted: {operation.name}")

            max_wait, waited = 300, 0
            while not operation.done and waited < max_wait:
                time.sleep(10)
                waited += 10
                operation = client.operations.get(operation.name)
                logger.info(f"[Veo] Generating… ({waited}s)")

            if not operation.done:
                raise RuntimeError(f"Veo timed out after {max_wait}s")
            if not (operation.response and operation.response.generated_videos):
                raise RuntimeError("Veo returned no videos")

            veo_uri = operation.response.generated_videos[0].video.uri
            download_url = (
                f"{veo_uri}&key={google_ai_key}"
                if "?" in veo_uri
                else f"{veo_uri}?key={google_ai_key}"
            )

            resp = requests.get(download_url, timeout=120)
            resp.raise_for_status()
            video_bytes = resp.content
            logger.info(f"[Veo] Downloaded {len(video_bytes):,} bytes")

            if not all([r2_endpoint, r2_key_id, r2_secret, r2_bucket]):
                logger.warning("[Veo] R2 not configured — returning Google URI")
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
                Bucket=r2_bucket, Key=object_key,
                Body=video_bytes, ContentType="video/mp4",
            )
            logger.info(f"[Veo] Uploaded to R2: {object_key}")
            return (
                f"{r2_public}/{object_key}"
                if r2_public
                else f"{r2_endpoint.rstrip('/')}/{r2_bucket}/{object_key}"
            )

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _generate_and_upload)

    except Exception as e:
        logger.error(f"[Veo] Error: {e}")
        raise
