"""
Video Generation Service
========================
Handles AI video generation via LTX Video 2.3 fast (fal.ai).

Primary Pipeline (when product image is available):
    1. Flux Dev image-to-image → transforms product photo into cinematic 9:16 first frame
    2. LTX Video 2.3 fast image-to-video → animate that frame (~30s)

    WHY two-step:
    - Raw product photos (plain white background) produce boring animations
    - Flux image-to-image keeps the product visually anchored while adding a cinematic scene
      (strength 0.65–0.80: the product shape/colour is preserved, background transforms)
    - LTX then animates that scene → fast, cinematic product reel

    WHY image-to-image instead of IP-Adapter:
    - InstantX/FLUX.1-dev-IP-Adapter only ships ip-adapter.bin (5.29 GB Pickle format)
    - fal.ai cannot load non-safetensors IP-Adapter weights → HTTP 422 at runtime
    - image-to-image achieves the same visual anchoring more reliably:
      the product IS the input image, so it appears in the output naturally

Fallback Pipeline (when no product image):
    LTX Video 2.3 fast text-to-video → scene from prompt only

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
    1. fal.ai Flux Dev + LTX Video 2.3 fast  — primary (fast, ~30s per clip)
    2. Google Veo 2.0                         — quality fallback (slow, expensive)
    3. Sample video                           — free fallback for dev/CI
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

# LTX Video 2.3 fast — two variants depending on whether a first frame is provided.
# Fast endpoint: ~$0.04/s — good balance of speed and quality.
LTX_IMAGE_MODEL = "fal-ai/ltx-2.3/image-to-video/fast"  # Flux first frame → animation
LTX_TEXT_MODEL  = "fal-ai/ltx-2.3/text-to-video/fast"   # text-only fallback (no image)

# Flux — first frame generator with three-tier product conditioning.
#
# Tier 1 — fal-ai/flux-general + XLabs IP-Adapter (primary, best result):
#   "Injects" product identity (colour, shape, texture) into a brand-new FLUX generation.
#   XLabs-AI/flux-ip-adapter is a FLUX.1-dev-native IP-Adapter that ships as
#   ip_adapter.safetensors (unlike InstantX which is .bin/Pickle and fails on fal.ai).
#   The model generates a fresh cinematic scene from the prompt WHILE anchoring
#   the product's visual identity via the IP-Adapter reference — the ideal approach
#   for product advertising because the scene is truly cinematic and the product is faithful.
#
# Tier 2 — fal-ai/flux/dev/image-to-image (fallback if IP-Adapter fails):
#   Sends product photo as input; Flux transforms the background into the cinematic scene
#   while partially preserving the product. Trade-off: strength controls product vs scene
#   balance — not as clean as IP-Adapter but better than text-only.
#   strength (0.65–0.80) driven by ip_weight from Gemini fidelity scoring.
#
# Tier 3 — fal-ai/flux/dev text-only (final fallback):
#   Pure text prompt. Gemini prompt includes product description so scene quality is
#   still good, but no direct product visual anchoring.
FLUX_GENERAL_MODEL = "fal-ai/flux-general"              # IP-Adapter-capable FLUX.1-dev
FLUX_IMG2IMG_MODEL = "fal-ai/flux/dev/image-to-image"   # img2img fallback
FLUX_DEV_MODEL     = "fal-ai/flux/dev"                  # text-only final fallback

# XLabs FLUX IP-Adapter — FLUX.1-dev native, ships as safetensors (fal.ai compatible).
# Chosen over InstantX/FLUX.1-dev-IP-Adapter which is .bin (Pickle) format and fails
# on fal.ai with: 'NoneType object has no attribute split' → HTTP 422.
FLUX_IP_ADAPTER_PATH       = "XLabs-AI/flux-ip-adapter"
FLUX_IP_ADAPTER_WEIGHT     = "ip_adapter.safetensors"
FLUX_IP_IMAGE_ENCODER_PATH = "openai/clip-vit-large-patch14"

# ip_weight scored by Gemini (0.30–0.80):
#   → IP-Adapter scale       (0.30–0.80): higher = product more dominant in generation
#   → img2img strength       (0.65–0.80): higher = less background transformation
#   → guidance_scale         (2.5–4.5):   higher = more prompt-faithful
FLUX_IP_TOTAL_WEIGHT = 0.75


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
# Flux Dev — First Frame Generator
# ─────────────────────────────────────────────────────────────────────────────

async def generate_first_frame_with_flux(
    prompt: str,
    product_image_urls: list[str],
    ip_weight: float = FLUX_IP_TOTAL_WEIGHT,
) -> str:
    """
    Generate a cinematic first frame using Flux with three-tier product conditioning.

    Tier 1 — flux-general + XLabs IP-Adapter (primary, best result):
        Injects product identity (colour, shape, texture) into a fresh FLUX generation.
        XLabs-AI/flux-ip-adapter ships as ip_adapter.safetensors — compatible with fal.ai.
        Generates a new cinematic scene from the Gemini prompt while the IP-Adapter
        anchors the product's visual identity. Best approach for product advertising.

    Tier 2 — flux/dev image-to-image (fallback):
        Product photo sent as input; Flux transforms background into the cinematic scene.
        Trade-off: strength (0.65–0.80) controls product preservation vs scene transformation.
        Not as clean as IP-Adapter but still uses the real product image.

    Tier 3 — flux/dev text-only (final fallback):
        Pure text generation. Gemini prompt includes product description so scene quality
        is maintained, but no direct product visual anchoring.

    Args:
        prompt:              Cinematic scene description from Gemini (environment, action, camera)
        product_image_urls:  Product image URLs sorted primary-first. First URL is used as
                             IP-Adapter / img2img reference; remaining available as context.
        ip_weight:           Fidelity weight (0.30–0.80) from Gemini prompt scoring.
                             Maps to: IP-Adapter scale, img2img strength, and guidance_scale.

    Returns:
        fal.media CDN URL of the Flux-generated first frame image

    Raises:
        ValueError:   If product_image_urls is empty
        RuntimeError: If all three generation tiers fail
    """
    if not product_image_urls:
        raise ValueError("At least one product image URL is required")

    primary_image_url = product_image_urls[0]

    # Map ip_weight (0.30–0.80) → guidance_scale (2.5–4.5)
    guidance_scale = round(2.5 + (ip_weight - 0.30) / 0.50 * 2.0, 2)

    # Map ip_weight (0.30–0.80) → img2img strength (0.65–0.80) for Tier 2 fallback.
    # Higher ip_weight = more product-faithful → higher strength (less scene transformation).
    img2img_strength = round(0.65 + (ip_weight - 0.30) / 0.50 * 0.15, 2)

    try:
        import fal_client
        loop = asyncio.get_running_loop()

        # ── Tier 1: flux-general + XLabs IP-Adapter ──────────────────────────────
        # XLabs-AI/flux-ip-adapter is FLUX.1-dev native and ships as safetensors —
        # unlike InstantX/FLUX.1-dev-IP-Adapter (.bin/Pickle) which fails on fal.ai.
        logger.info(
            f"[Flux] Tier 1: flux-general + XLabs IP-Adapter "
            f"(scale={ip_weight}, guidance={guidance_scale}): {prompt[:60]}..."
        )

        def _run_ip_adapter():
            logger.info(
                f"[Flux] Calling flux-general + XLabs IP-Adapter | "
                f"image: {primary_image_url[:80]} | scale={ip_weight} | guidance={guidance_scale}"
            )
            result = fal_client.run(
                FLUX_GENERAL_MODEL,
                arguments={
                    "prompt":               prompt,
                    "image_size":           "portrait_16_9",  # 9:16 portrait for social reels
                    "num_inference_steps":  28,
                    "guidance_scale":       guidance_scale,
                    "num_images":           1,
                    "enable_safety_checker": True,
                    "ip_adapters": [
                        {
                            "path":                FLUX_IP_ADAPTER_PATH,
                            "weight_name":         FLUX_IP_ADAPTER_WEIGHT,   # ip_adapter.safetensors
                            "image_encoder_path":  FLUX_IP_IMAGE_ENCODER_PATH,
                            "image_url":           primary_image_url,
                            "scale":               ip_weight,
                        }
                    ],
                },
            )
            images = result.get("images") or []
            if not images:
                raise RuntimeError(
                    f"flux-general returned no images. "
                    f"Response keys: {list(result.keys()) if isinstance(result, dict) else result}"
                )
            url = images[0].get("url")
            if not url:
                raise RuntimeError(f"flux-general image missing 'url'. Entry: {images[0]}")
            return url

        try:
            url = await loop.run_in_executor(None, _run_ip_adapter)
            logger.info(f"[Flux] ✅ Tier 1 IP-Adapter first frame ready: {url[:80]}")
            return url
        except Exception as ip_err:
            logger.warning(
                f"[Flux] ⚠️ Tier 1 IP-Adapter FAILED — trying Tier 2 img2img. "
                f"Reason: {ip_err}"
            )

        # ── Tier 2: flux/dev image-to-image ──────────────────────────────────────
        # Product photo as input; Flux transforms background while partially preserving
        # product. Trade-off vs IP-Adapter: can't simultaneously keep product 100% intact
        # AND transform background fully — strength controls which side wins.
        logger.warning(
            f"[Flux] Tier 2: flux/dev image-to-image "
            f"(strength={img2img_strength}, guidance={guidance_scale}): {prompt[:60]}..."
        )

        def _run_img2img():
            logger.info(
                f"[Flux] Calling flux/dev image-to-image | "
                f"image: {primary_image_url[:80]} | strength={img2img_strength}"
            )
            result = fal_client.run(
                FLUX_IMG2IMG_MODEL,
                arguments={
                    "prompt":               prompt,
                    "image_url":            primary_image_url,
                    "strength":             img2img_strength,
                    "num_inference_steps":  28,
                    "guidance_scale":       guidance_scale,
                    "num_images":           1,
                    "enable_safety_checker": True,
                },
            )
            images = result.get("images") or []
            if not images:
                raise RuntimeError(
                    f"flux/dev image-to-image returned no images. "
                    f"Response keys: {list(result.keys()) if isinstance(result, dict) else result}"
                )
            url = images[0].get("url")
            if not url:
                raise RuntimeError(f"flux/dev image-to-image missing 'url'. Entry: {images[0]}")
            return url

        try:
            url = await loop.run_in_executor(None, _run_img2img)
            logger.warning(f"[Flux] ⚠️ Tier 2 img2img first frame (product may vary): {url[:80]}")
            return url
        except Exception as img2img_err:
            logger.warning(
                f"[Flux] ⚠️ Tier 2 img2img FAILED — falling back to Tier 3 text-only. "
                f"Reason: {img2img_err}"
            )

        # ── Tier 3: flux/dev text-only ────────────────────────────────────────────
        # Pure text generation. The Gemini prompt includes product description so
        # scene quality is still good, but no direct product visual anchoring.
        logger.warning(
            f"[Flux] ❌ Tier 3: flux/dev TEXT-ONLY — product image NOT applied. "
            f"guidance={guidance_scale}, prompt={prompt[:60]}..."
        )

        def _run_text_only():
            result = fal_client.run(
                FLUX_DEV_MODEL,
                arguments={
                    "prompt":               prompt,
                    "image_size":           "portrait_16_9",
                    "num_inference_steps":  28,
                    "guidance_scale":       guidance_scale,
                    "num_images":           1,
                    "enable_safety_checker": True,
                },
            )
            images = result.get("images") or []
            if not images:
                raise RuntimeError(
                    f"flux/dev returned no images. "
                    f"Response keys: {list(result.keys()) if isinstance(result, dict) else result}"
                )
            url = images[0].get("url")
            if not url:
                raise RuntimeError(f"flux/dev image missing 'url'. Entry: {images[0]}")
            return url

        url = await loop.run_in_executor(None, _run_text_only)
        logger.warning(f"[Flux] ❌ Tier 3 text-only first frame: {url[:80]}")
        return url

    except Exception as e:
        logger.error(f"[Flux] First frame generation failed entirely: {e}")
        raise RuntimeError(f"Flux first frame generation failed: {e}") from e


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
        With image_url  → LTX_IMAGE_MODEL (image-to-video): Flux first frame anchors
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
        image_url:  Flux-generated first frame URL (None → text-to-video mode)
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

    except Exception as e:
        logger.error(f"[LTX] Failed: {e}")
        raise RuntimeError(f"LTX Video 2.3 generation failed: {e}") from e


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
        Clip 1 (20s): flux_first_frame → LTX 2.3
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
        image_url:      Flux-generated first frame for clip 1 (None → text-to-video)
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
    current_image_url = image_url  # Clip 1 uses Flux first frame; subsequent = last frame

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
    Generate a video using the best available provider (LTX → Veo → sample).

    Used by the worker when FAL_KEY is not configured (fallback path).
    For the primary worker flow see _run_ltx_generation() in worker.py.

    Args:
        prompt:     Creative brief (enriched with product metadata by worker)
        image_url:  Product image URL for visual reference
        resolution: Passed through for compatibility; LTX always uses 1080p + 9:16
        duration:   Clip length in seconds (passed to LTX, snapped to valid value)
        with_audio: True to generate native audio (passed to LTX generate_audio)

    Returns:
        Public URL to the generated video
    """
    fal_key       = os.getenv("FAL_KEY", "")
    veo_enabled   = os.getenv("VEO_ENABLED", "false").lower() == "true"
    google_ai_key = os.getenv("GOOGLE_AI_API_KEY", "")

    # ── Option 1: LTX Video 2.3 via fal.ai (primary — fast, native audio)
    if fal_key:
        try:
            return await generate_with_ltx(prompt, image_url, duration, with_audio)
        except Exception as e:
            logger.warning(f"[LTX] Failed, trying Veo: {e}")

    # ── Option 2: Google Veo 2.0 (best quality, slow / expensive)
    if veo_enabled and google_ai_key:
        try:
            return await _generate_with_veo(prompt)
        except Exception as e:
            logger.warning(f"[Veo] Failed, using sample fallback: {e}")

    # ── Option 3: Sample video (development / CI only — no AI cost)
    logger.info("[Video] No AI provider available — using sample video")
    await asyncio.sleep(3)
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"


# ─────────────────────────────────────────────────────────────────────────────
# Veo 2.0 — Quality Fallback (not the primary path)
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_with_veo(prompt: str) -> str:
    """
    Generate video using Google Veo 2.0 (best quality but slow / expensive).

    Steps:
        1. Submit generation request → operation ID
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

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _generate_and_upload)

    except Exception as e:
        logger.error(f"[Veo] Error: {e}")
        raise
