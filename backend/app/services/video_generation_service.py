"""
Video Generation Service
========================
Handles AI video generation via Gemini 3 Pro Image (first frame) + LTX Video 2.3 fast (animation).

Primary Pipeline (when product image is available):
    1. Gemini 3 Pro Image → generates a product-accurate cinematic 9:16 first frame
    2. LTX Video 2.3 fast image-to-video → animate that frame (~30s)

    WHY two-step:
    - Raw product photos (plain white background) produce boring animations
    - Gemini 3 Pro Image receives product photos directly in context — the model
      sees and reasons about the product holistically (colour, shape, character details,
      logo markings) before generating, preserving product identity without a separate
      text description step.
    - LTX then animates that scene → fast, cinematic product reel

    WHY Gemini 3 Pro Image over Imagen 3 / Flux + IP-Adapter:
    - CLIP-based IP-Adapters capture only statistical colour/shape patterns — they
      cannot reproduce specific character details (one eye, particular teeth, tiny logo)
    - Imagen 3 translates product photos → text description → image (information loss)
    - Gemini 3 Pro Image receives up to 14 product photos directly, uses Thinking mode
      to reason about the product, and generates without the text translation step

Fallback Pipeline (when no product image / Gemini unavailable):
    LTX Video 2.3 fast text-to-video → scene from Gemini Flash-crafted prompt only

Audio:
    LTX 2.3 generates native audio alongside video (ambient / sound-effects).
    Pass with_audio=True  → LTX produces a video with an audio track.
    Pass with_audio=False → LTX produces a silent video (no post-processing needed).
    Audio is controlled at generation time via the generate_audio parameter —
    no FFmpeg strip pass required for AI-generated videos.

Duration handling:
    ≤ 20s → single LTX call  (native, up to 20s per API call)
    > 20s → chained clips    (last frame of clip N seeds clip N+1)
             → FFmpeg concat → R2 upload → object key returned
    Note: durations > 10s require fps=25 + resolution="1080p" (fal.ai API constraint).

Providers (priority order):
    1. Imagen 3 (first frame) + LTX Video 2.3 fast  — primary (product-accurate, ~30s/clip)
    2. Sample video                                  — free fallback for dev/CI
"""

import os
import math
import asyncio
import tempfile
import logging
from typing import Optional

import ffmpeg
import httpx

from app.exceptions import (
    GeminiAPIException,
    GenerationTimeoutException,
    LTXVideoAPIException,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Model Constants
# ─────────────────────────────────────────────────────────────────────────────

# LTX Video 2.3 fast — two variants depending on whether a first frame is provided.
# Fast endpoint: ~$0.04/s — good balance of speed and quality.
LTX_IMAGE_MODEL = "fal-ai/ltx-2.3/image-to-video/fast"  # Imagen 3 first frame → animation
LTX_TEXT_MODEL  = "fal-ai/ltx-2.3/text-to-video/fast"   # text-only fallback (no image)


# ─────────────────────────────────────────────────────────────────────────────
# Duration Constants
# ─────────────────────────────────────────────────────────────────────────────

# LTX 2.3 fast accepts these duration values (seconds) per single API call.
# Durations > 10s require fps=25 + resolution="1080p" (fal.ai API constraint).
_VALID_LTX_DURATIONS = (6, 8, 10, 12, 14, 16, 18, 20)

# Maximum seconds per single LTX API call.
# Videos longer than this use the extend chain (generate_extended_ltx).
LTX_MAX_CLIP_DURATION = 20


def _snap_to_ltx_duration(seconds: int) -> int:
    """Snap requested seconds to the nearest valid LTX 2.3 duration (6–20, even steps).

    Valid values: 6, 8, 10, 12, 14, 16, 18, 20.
    Out-of-range values are clamped to the nearest valid entry.

    Examples:
        5  → 6   (clamped to minimum)
        15 → 16  (nearest even)
        21 → 20  (clamped to maximum)
    """
    return min(_VALID_LTX_DURATIONS, key=lambda d: abs(d - seconds))


# ─────────────────────────────────────────────────────────────────────────────
# Temp File Helpers
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


# ─────────────────────────────────────────────────────────────────────────────
# Extend Chain Helpers (for videos longer than LTX_MAX_CLIP_DURATION)
# ─────────────────────────────────────────────────────────────────────────────

async def _extract_last_frame(video_url: str) -> str:
    """
    Download a video clip, extract its last frame with FFmpeg, and upload
    the frame to fal.ai storage for use as the first-frame anchor of the
    next LTX clip in the extend chain.

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
        logger.info(f"[Extend] Downloaded clip ({len(resp.content):,} bytes) → {video_tmp}")

        # ── 2. Extract last frame with FFmpeg ────────────────────────────────
        # -sseof -0.05 = seek to 50ms before end of file (last frame, no ffprobe needed).
        # imageio-ffmpeg provides a bundled binary — no system ffmpeg install required.
        fd, frame_tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)

        def _extract():
            import imageio_ffmpeg as _iio_ffmpeg
            (
                ffmpeg
                .input(video_tmp, sseof=-0.05)
                .output(frame_tmp, vframes=1, **{"f": "image2", "vcodec": "mjpeg"})
                .run(quiet=True, overwrite_output=True, cmd=_iio_ffmpeg.get_ffmpeg_exe())
            )

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _extract)
        logger.info(f"[Extend] Last frame extracted → {frame_tmp}")

        # ── 3. Upload frame to fal.ai storage (returns public CDN URL) ───────
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

    Stream copy is codec-neutral and lossless — all clips share the same codec,
    resolution, and fps since they all come from the same LTX 2.3 configuration.
    Audio tracks (if present) are also copied without re-encoding.

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

        # ── 2. Write FFmpeg concat list ───────────────────────────────────────
        fd, list_path = tempfile.mkstemp(suffix="_concat.txt")
        with os.fdopen(fd, "w") as f:
            for p in clip_paths:
                safe = p.replace("'", "'\\''")  # escape single quotes in path
                f.write(f"file '{safe}'\n")

        # ── 3. Concatenate (stream copy — no re-encode, lossless) ────────────
        fd, output_path = tempfile.mkstemp(suffix="_extended.mp4")
        os.close(fd)

        def _concat():
            import imageio_ffmpeg as _iio_ffmpeg
            (
                ffmpeg
                .input(list_path, format="concat", safe=0)
                .output(output_path, c="copy")
                .run(quiet=True, overwrite_output=True, cmd=_iio_ffmpeg.get_ffmpeg_exe())
            )

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _concat)
        logger.info(f"[Concat] Complete: {output_path}")

        # ── 4. Upload concatenated video to R2 ───────────────────────────────
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
# First Frame Upload Helper (fal.ai storage)
# ─────────────────────────────────────────────────────────────────────────────

async def _upload_image_to_fal(image_bytes: bytes, suffix: str = ".png") -> str:
    """
    Write image bytes to a temp file and upload to fal.ai storage.

    LTX Video 2.3 requires a publicly accessible URL for its image_url parameter —
    it cannot receive raw bytes directly. fal.ai storage provides a short-lived CDN
    URL (~24h TTL) that LTX fetches during generation.

    Args:
        image_bytes: Raw image data (PNG/JPEG from Gemini 3 Pro Image, or JPEG from last-frame extract)
        suffix:      File extension hint for MIME detection (".png" default)

    Returns:
        Public fal.media CDN URL that LTX can fetch

    Raises:
        RuntimeError: If fal_client upload fails
    """
    import fal_client

    loop = asyncio.get_running_loop()
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)

    try:
        with os.fdopen(fd, "wb") as f:
            f.write(image_bytes)

        def _upload():
            return fal_client.upload_file(tmp_path)

        url: str = await loop.run_in_executor(None, _upload)
        logger.info(f"[Gemini3Pro] Frame uploaded to fal.ai storage: {url[:80]}")
        return url
    finally:
        _cleanup_temp(tmp_path)


# ─────────────────────────────────────────────────────────────────────────────
# Gemini 3 Pro Image — First Frame Generator
# ─────────────────────────────────────────────────────────────────────────────

async def generate_first_frame_with_gemini(
    prompt: str,
    product_images: list[tuple[bytes, str]],
    aspect_ratio: str = "9:16",
    resolution: str = "1K",
) -> str:
    """
    Generate a cinematic first frame using Gemini 3 Pro Image (Nano Banana Pro).

    Unlike Imagen 3's SUBJECT reference approach, Gemini 3 Pro Image receives
    product photos directly in the conversation context — the model sees and
    reasons about the product holistically before generating, preserving material
    type, distinguishing features, and product identity without a separate text
    description step.

    Supports up to 14 high-fidelity object references (10 object + 4 character).
    Uses built-in Thinking mode to reason through composition before generating.
    Runs on GOOGLE_AI_API_KEY — no Vertex AI service account required.

    Args:
        prompt:         Scene description (environment, lighting, style, mood).
                        Does NOT need to describe the product — model sees it directly.
        product_images: List of (bytes, mime_type) tuples. Up to 6 used as object
                        references; extras are silently dropped.
        aspect_ratio:   Output aspect ratio (e.g. "9:16" for portrait Reels)
        resolution:     Output resolution ("1K", "2K", "4K") — 1K for cost efficiency

    Returns:
        fal.media CDN URL of the generated first frame image

    Raises:
        RuntimeError: If GOOGLE_AI_API_KEY is missing or generation fails
    """
    import io
    from google import genai
    from google.genai import types as genai_types
    from PIL import Image as PilImage

    api_key = os.getenv("GOOGLE_AI_API_KEY")
    if not api_key:
        raise GeminiAPIException(
            "GOOGLE_AI_API_KEY is not set for first-frame generation"
        )

    client = genai.Client(api_key=api_key)

    # gemini-3-pro-image supports up to 10 object + 4 character = 14 reference images
    _MAX_REFS = 14
    pil_images = [
        PilImage.open(io.BytesIO(img_bytes))
        for img_bytes, _mime in product_images[:_MAX_REFS]
    ]

    contents = [prompt] + pil_images

    def _gen():
        response = client.models.generate_content(
            model="gemini-3-pro-image",
            contents=contents,
            config=genai_types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=genai_types.ImageConfig(
                    aspect_ratio=aspect_ratio,  # "9:16" for portrait Reels
                    image_size=resolution,       # "1K" default — "2K"/"4K" for higher quality
                ),
            ),
        )
        for part in response.parts:
            if getattr(part, "thought", False):
                continue  # skip thinking steps
            if part.inline_data is not None:
                return part.inline_data.data  # raw bytes — no PIL conversion needed
        raise GeminiAPIException(
            "Gemini 3 Pro Image returned no image in response"
        )

    loop = asyncio.get_running_loop()
    try:
        result_bytes = await loop.run_in_executor(None, _gen)
    except GeminiAPIException:
        raise
    except Exception as exc:
        raise GeminiAPIException(str(exc)) from exc
    logger.info(
        f"[Gemini3Pro] ✅ First frame generated ({len(pil_images)} ref(s)): "
        f"{len(result_bytes):,} bytes"
    )
    return await _upload_image_to_fal(result_bytes)


# ─────────────────────────────────────────────────────────────────────────────
# LTX Video 2.3 — Animation Engine
# ─────────────────────────────────────────────────────────────────────────────

async def generate_with_ltx(
    prompt: str,
    image_url: Optional[str] = None,
    duration: int = 6,
    with_audio: bool = False,
) -> str:
    """
    Generate a single video clip using LTX Video 2.3 fast (fal.ai).

    Supports up to 20s per call natively. For longer videos use
    generate_extended_ltx() which chains clips via last-frame extraction.

    Mode selection:
        With image_url  → LTX_IMAGE_MODEL (image-to-video): Gemini 3 Pro Image first frame anchors
                          the animation for visual consistency.
        Without image   → LTX_TEXT_MODEL (text-to-video): pure text prompt.

    Audio:
        with_audio=True  → LTX generates native ambient / sound-effects audio.
        with_audio=False → Silent video (generate_audio=False sent to API).
        No FFmpeg post-processing needed — audio is controlled at generation time.

    Duration:
        Requested duration is snapped to the nearest valid LTX value:
        6, 8, 10, 12, 14, 16, 18, 20 seconds.
        Durations > 10s require fps=25 + resolution="1080p" (API constraint).
        All clips use 25fps for consistent audio/video concat in extend chains.

    Args:
        prompt:     Motion-first scene description (200–350 chars, LTX-optimised)
        image_url:  Imagen 3 first frame URL (None → text-to-video mode)
        duration:   Requested clip length in seconds (snapped to nearest valid value)
        with_audio: True to generate native audio; False for silent video

    Returns:
        Public CDN URL (fal.media) of the generated .mp4 clip

    Raises:
        RuntimeError: If fal.ai API call fails
    """
    try:
        import fal_client

        snapped_duration = _snap_to_ltx_duration(duration)

        # 25fps used throughout — required for durations > 10s, kept uniform
        # so audio/video streams are always compatible in the extend-chain concat.
        arguments: dict = {
            "prompt":         prompt,
            "duration":       snapped_duration,
            "resolution":     "1080p",        # fast endpoint: 1080p baseline
            "aspect_ratio":   "9:16",          # portrait for social media Reels
            "fps":            25,
            "generate_audio": with_audio,      # LTX native audio generation
        }

        if image_url:
            model = LTX_IMAGE_MODEL
            arguments["image_url"] = image_url
            logger.info(
                f"[LTX] image-to-video ({snapped_duration}s, audio={with_audio}): "
                f"{image_url[:80]}"
            )
        else:
            model = LTX_TEXT_MODEL
            logger.info(f"[LTX] text-to-video ({snapped_duration}s, audio={with_audio})")

        def _run():
            result = fal_client.run(model, arguments=arguments)
            # LTX 2.3 response: {"video": {"url": "https://fal.media/...mp4"}}
            return result["video"]["url"]

        loop = asyncio.get_running_loop()
        url = await loop.run_in_executor(None, _run)
        logger.info(f"[LTX] Done: {url}")
        return url

    except (asyncio.TimeoutError, TimeoutError) as exc:
        logger.error(f"[LTX] Timed out: {exc}")
        raise GenerationTimeoutException() from exc
    except (GenerationTimeoutException, LTXVideoAPIException):
        raise
    except Exception as exc:
        logger.error(f"[LTX] Failed: {exc}")
        raise LTXVideoAPIException(str(exc)) from exc


async def generate_extended_ltx(
    prompt: str,
    image_url: Optional[str],
    total_duration: int,
    reel_id: str = "unknown",
    with_audio: bool = False,
) -> str:
    """
    Generate a long-form video (> 20s) by chaining multiple LTX Video 2.3 clips.

    Each clip after the first is seeded from the LAST FRAME of the previous one —
    extracted with FFmpeg and uploaded to fal.ai — so the scene flows seamlessly.

    Example for 60s (3 × 20s clips):
        Clip 1 (20s): gemini3pro_first_frame → LTX 2.3
        Clip 2 (20s): last_frame(clip1) → LTX 2.3
        Clip 3 (20s): last_frame(clip2) → LTX 2.3
        ↓ FFmpeg concat → 60s video → R2 upload → object key returned

    Audio:
        All clips use the same with_audio setting — consistent audio state.
        FFmpeg concat (stream copy) preserves audio tracks when present.

    PROMPT GUIDANCE for multi-clip: prefer cyclic / ambient motion (gentle rotation,
    soft drift) over directional motion (zoom in, dolly forward). Directional
    motions become incoherent across clip boundaries since each clip starts from
    a new last frame rather than the previous camera position.

    Args:
        prompt:         LTX-optimised scene description (motion-first, 200–350 chars)
        image_url:      Gemini 3 Pro Image first frame for clip 1 (None → text-to-video)
        total_duration: Target duration in seconds (must exceed LTX_MAX_CLIP_DURATION)
        reel_id:        Reel UUID — used for R2 key naming of the concatenated output
        with_audio:     True to generate native audio for all clips

    Returns:
        - Single fal.ai CDN URL  if only 1 clip was needed (total_duration ≤ 20s)
        - R2 object key          for multi-clip concat (proxied via /api/upload/videos/{key})

    Raises:
        RuntimeError: If any clip generation or concatenation step fails
    """
    num_clips = math.ceil(total_duration / LTX_MAX_CLIP_DURATION)
    logger.info(
        f"[LTX-Extend] {total_duration}s → {num_clips} clips × {LTX_MAX_CLIP_DURATION}s "
        f"(audio={with_audio})"
    )

    clip_urls: list[str] = []
    current_image_url = image_url  # Clip 1 uses Gemini 3 Pro Image first frame; subsequent = last frame

    for i in range(num_clips):
        remaining = total_duration - i * LTX_MAX_CLIP_DURATION
        this_duration = min(LTX_MAX_CLIP_DURATION, remaining)

        logger.info(f"[LTX-Extend] Clip {i+1}/{num_clips} ({this_duration}s)")
        clip_url = await generate_with_ltx(
            prompt=prompt,
            image_url=current_image_url,
            duration=this_duration,
            with_audio=with_audio,
        )
        clip_urls.append(clip_url)

        # Extract last frame to seed the next clip (skip for the final clip)
        if i < num_clips - 1:
            try:
                current_image_url = await _extract_last_frame(clip_url)
            except RuntimeError as exc:
                # Frame extraction failed — reuse same image for visual continuity
                # (slightly less seamless but still functional)
                logger.warning(
                    f"[LTX-Extend] Frame extraction failed for clip {i+1}, "
                    f"reusing previous image: {exc}"
                )

    if len(clip_urls) == 1:
        logger.info("[LTX-Extend] Single clip — skipping concat")
        return clip_urls[0]

    # Multiple clips → FFmpeg concat → R2 object key
    return await _concat_clips(clip_urls, reel_id)


# ─────────────────────────────────────────────────────────────────────────────
# Backward-compatible facade
# ─────────────────────────────────────────────────────────────────────────────

async def generate_video(
    prompt: str,
    image_url: Optional[str] = None,
    resolution: str = "1080p",
    duration: int = 10,
    with_audio: bool = False,
) -> str:
    """
    Generate a video using LTX Video 2.3 (primary) with sample fallback.

    Used by the worker when FAL_KEY is not configured (fallback path).
    For the primary worker flow see _run_ltx_generation() in worker.py which
    uses Gemini 3 Pro Image → LTX Video 2.3 for product-accurate generation.

    Args:
        prompt:     Creative brief (enriched with product metadata by worker)
        image_url:  Product image URL for visual reference
        resolution: Passed through for compatibility; LTX always uses 1080p + 9:16
        duration:   Clip length in seconds (passed to LTX, snapped to valid value)
        with_audio: True to generate native audio (passed to LTX generate_audio)

    Returns:
        Public URL to the generated video
    """
    fal_key = os.getenv("FAL_KEY", "")

    # ── Option 1: LTX Video 2.3 via fal.ai (primary — fast, native audio)
    if fal_key:
        try:
            return await generate_with_ltx(prompt, image_url, duration, with_audio)
        except Exception as e:
            logger.warning(f"[LTX] Failed, using sample fallback: {e}")

    # ── Fallback: Sample video (development / CI only — no AI cost)
    logger.info("[Video] No AI provider available — using sample video")
    await asyncio.sleep(3)
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
