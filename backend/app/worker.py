import os
import math
import asyncio
import logging
from celery import Celery
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models.models import Reel, Product
from app.services.ai_service import generate_captions, generate_first_frame_prompt
from app.services.video_generation_service import (
    generate_video,
    generate_with_ltx,
    generate_extended_ltx,
    generate_first_frame_with_imagen,
    LTX_MAX_CLIP_DURATION,
)
from app.services.overlay_service import apply_overlay, strip_audio_from_video
from app.services.reel_service import update_reel
from app.services.storage_service import get_presigned_url

logger = logging.getLogger(__name__)

celery_app = Celery(
    "worker",
    broker=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
)

celery_app.conf.task_routes = {
    "app.worker.process_reel_generation": "main-queue"
}


@celery_app.task(name="app.worker.process_reel_generation")
def process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", duration: int = 10, with_audio: bool = False,
):
    """
    Celery background task: orchestrate reel generation pipeline.

    Handles AI video generation (Imagen 3 + LTX), FFmpeg overlay, and caption generation.
    Supports partial regeneration (e.g., video only, caption only).

    Args:
        reel_id:          UUID of reel being processed
        platform:         Target social platform (ig/fb/tt/yt) for caption optimization
        overlay_position: Logo/product placement (top-left/right, bottom-left/right, center)
        target:           Generation scope — "all" (full pipeline) | "video" (video only) |
                          "caption" (Gemini only) | "upload" (uploaded video → overlay → captions)
        duration:         Video length in seconds — snapped to nearest valid LTX value (6–20s)
        with_audio:       True = LTX generates native audio; False = silent video
    """
    asyncio.run(_async_process_reel_generation(
        reel_id, platform, overlay_position, target, duration, with_audio
    ))


async def _async_process_reel_generation(
    reel_id: str, platform: str, overlay_position: str,
    target: str = "all", duration: int = 10, with_audio: bool = False,
):
    """
    Async implementation: AI generation + overlay + caption pipeline.

    Workflow:
        1. Load reel + product from DB; enrich prompt with product metadata (F2-URS02-SRS01)
        2. Generate video via Imagen 3 (first frame) + LTX Video 2.3 (animation):
             ≤ 20s → single LTX clip
             > 20s → multi-clip extend chain (clips chained via last-frame extraction)
           OR use uploaded video (target="upload")
        3. Apply FFmpeg overlay (product image + brand logo) (F2-URS05-SRS01)
           with_audio controls whether the overlay pass preserves the audio track.
           For AI videos: audio was already set at LTX generation time (generate_audio).
           For uploads: strip_audio fallback runs if overlay was skipped.
        4. Generate captions + hashtags with Gemini (F2-URS03)
        5. Persist all outputs to DB and mark reel Complete
    """
    db = SessionLocal()
    try:
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if not reel:
            logger.error(f"Reel {reel_id} not found in database")
            return

        update_reel(db, reel=reel, status="Generating")

        product = (
            db.query(Product)
            .options(joinedload(Product.images))
            .filter(Product.product_id == reel.product_id)
            .first()
        )
        # Build rich product context for caption generation (name + description)
        if product:
            product_info = f"Product: {product.product_name}"
            if product.description:
                product_info += f". {product.description}"
        else:
            product_info = ""

        # Resolve product image URLs:
        #   product_image_url  (primary only) — used for overlay watermark fallback
        #   product_image_urls (ALL images)   — downloaded as bytes for Imagen 3 SUBJECT
        #       reference and for Gemini first-frame prompt generation
        product_image_url: str | None = None   # Primary — overlay fallback
        product_image_urls: list[str] = []      # All images — presigned URLs for download

        if product and product.images:
            primary = next((img for img in product.images if img.is_primary), None)
            primary_img = primary or product.images[0]
            raw_primary_key = primary_img.image_url
            # Presigned URL (1h) — valid for fal.ai fetch and httpx overlay download
            product_image_url = get_presigned_url(raw_primary_key) if raw_primary_key else None

            # Collect ALL product image URLs — will be downloaded as bytes for Imagen 3
            for img in product.images:
                if img.image_url:
                    product_image_urls.append(get_presigned_url(img.image_url))

            logger.info(
                f"[Worker] Product images resolved: {len(product_image_urls)} total "
                f"(primary: {bool(product_image_url)})"
            )

        # Resolve overlay URL for FFmpeg watermark (F2-URS05-SRS01)
        # Brand logo preferred; fall back to product image if no logo configured
        # DB stores R2 object keys — convert to full public URL for httpx download
        overlay_url: str | None = None
        if product:
            raw_logo = product.brand_logo_url
            if raw_logo:
                # Presigned URL (1h) so httpx overlay_service can download without public bucket
                overlay_url = get_presigned_url(raw_logo)
            elif product_image_url:
                overlay_url = product_image_url  # Already presigned above

        # Build the final video prompt for LTX Video 2.3 (F2-URS02-SRS01).
        # Gemini-generated prompts already describe the scene visually in detail.
        # Only append the product name as a light anchor if not already present.
        # Avoid overloading — LTX works best with short, concise prompts (200–350 chars).
        video_prompt = reel.prompt_text
        if product and product.product_name:
            name_lower = product.product_name.lower()
            prompt_lower = reel.prompt_text.lower()
            if name_lower not in prompt_lower:
                # Append product name so both Imagen 3 and LTX know the subject (F2-URS02-SRS01)
                video_prompt = f"{reel.prompt_text.rstrip('.')}. Product: {product.product_name}."

        # ── Step 1: Determine video source ──────────────────────────────────
        if target in ["all", "video"]:
            # Pipeline: Imagen 3 (first frame) → LTX Video 2.3 (animation)
            #
            # Two prompts are generated for the two stages:
            #   imagen_prompt — static scene description, product-focused (for first frame)
            #   video_prompt  — motion description, action-forward (for LTX animation)
            #
            # WHY different: LTX works best with motion prompts ("A hand clips...").
            # Imagen 3 needs a static scene description describing the product's visual
            # features so it can generate an accurate, product-faithful first frame.
            # The product photo is also sent as a SUBJECT reference for semantic fidelity.
            imagen_prompt: str | None = None
            product_image_bytes: list[tuple[bytes, str]] = []

            if product and product_image_urls:
                try:
                    # Fetch ALL product images as bytes for both Gemini (prompt generation)
                    # and Imagen 3 (SUBJECT reference). More angles = better fidelity.
                    product_image_bytes = await _fetch_product_image_bytes(
                        product_image_urls
                    )
                    imagen_prompt = await generate_first_frame_prompt(
                        video_prompt=video_prompt,
                        product_name=product.product_name or "",
                        product_description=product.description or "",
                        product_images=product_image_bytes or None,
                    )
                    logger.info(
                        f"[Worker] Imagen 3 first-frame prompt "
                        f"({len(product_image_bytes)} image(s) sent to Gemini): "
                        f"{imagen_prompt[:80]}..."
                    )
                except Exception as ffp_err:
                    logger.warning(
                        f"[Worker] First-frame prompt generation failed, "
                        f"using video prompt for Imagen 3: {ffp_err}"
                    )

            final_video_url = await _run_ltx_generation(
                prompt=video_prompt,
                image_url=product_image_url,              # Primary product image URL (LTX fallback)
                product_image_bytes=product_image_bytes,  # All images as bytes — Imagen 3 SUBJECT ref
                duration=duration,
                with_audio=with_audio,
                reel_id=reel_id,
                imagen_prompt=imagen_prompt,              # Static first-frame prompt for Imagen 3
            )
        elif target == "upload":
            # User-uploaded video — apply overlay + captions, skip AI generation
            final_video_url = reel.uploaded_video_url
        else:
            # Caption-only regeneration — retain existing video
            final_video_url = reel.final_commercial_video_url

        # ── Step 1b: Persist raw (pre-overlay) video URL ─────────────────────
        # Saved BEFORE overlay so Option B logo toggle works at download time:
        #   with_logo=True  → frontend uses final_commercial_video_url (baked logo)
        #   with_logo=False → frontend uses raw_video_url (no logo)
        #
        # WHY upload CDN URLs to R2:
        #   fal.ai CDN URLs (https://fal.media/...) are temporary (~24h TTL).
        #   Storing an R2 key ensures raw_video_url remains valid indefinitely.
        #   R2 keys also guarantee the download endpoint returns a presigned URL
        #   (JSONResponse) instead of streaming — streaming is intercepted by IDM
        #   (Internet Download Manager) browser extension which returns 204 without
        #   CORS headers, breaking the frontend fetch call entirely.
        if target in ["all", "video"] and final_video_url:
            raw_ref = final_video_url
            if raw_ref.startswith("http"):
                try:
                    raw_ref = await _upload_cdn_video_to_r2(final_video_url, reel_id)
                    logger.info(f"[Worker] Raw video persisted to R2: {raw_ref}")
                except Exception as e:
                    logger.warning(f"[Worker] Raw R2 upload failed, keeping CDN URL: {e}")
            update_reel(db, reel=reel, raw_video_url=raw_ref)
        elif target == "upload" and reel.uploaded_video_url:
            update_reel(db, reel=reel, raw_video_url=reel.uploaded_video_url)

        # ── Step 2: Apply FFmpeg overlay (brand logo / product image) ───────
        overlay_applied = False  # Track whether FFmpeg ran — needed for audio strip fallback
        if target in ["all", "video", "upload"] and overlay_url and final_video_url:
            # R2 object keys (not starting with "http") need a presigned URL so
            # overlay_service.download_to_temp() can fetch them without auth.
            # fal.ai CDN URLs (starting with "http") are directly downloadable.
            video_for_download = final_video_url
            if final_video_url and not final_video_url.startswith("http"):
                video_for_download = get_presigned_url(final_video_url)
                logger.info(f"[Worker] Resolved R2 key to presigned URL for overlay download")

            logger.info(f"[Worker] Applying overlay from: {overlay_url}")
            try:
                # apply_overlay returns an R2 object key on success, raises on failure.
                # When with_audio=False, FFmpeg uses -an to strip the audio track.
                overlaid_key = await apply_overlay(
                    video_url=video_for_download,
                    overlay_url=overlay_url,
                    position=overlay_position,
                    reel_id=reel_id,
                    with_audio=with_audio,
                )
                final_video_url = overlaid_key  # R2 key — frontend proxies via /api/upload/videos/{key}
                overlay_applied = True
            except Exception as overlay_err:
                # Graceful degradation: reel still works without overlay
                # Keep final_video_url as the original R2 key or fal.ai CDN URL
                logger.warning(f"[Worker] Overlay failed, keeping original video: {overlay_err}")

        # ── Step 2b: Audio strip fallback (upload path only)
        # For AI-generated videos (target="all"/"video") LTX already produced the
        # video silent when with_audio=False (generate_audio=False at generation time)
        # — no FFmpeg strip needed.
        # For user-uploaded videos (target="upload") the original video may have audio
        # even when the overlay step was skipped (no product logo/image configured).
        # In that case run a dedicated FFmpeg pass (vcodec copy + -an) to strip it.
        if not with_audio and not overlay_applied and final_video_url and target == "upload":
            video_for_strip = final_video_url
            if not final_video_url.startswith("http"):
                video_for_strip = get_presigned_url(final_video_url)
            try:
                stripped_key = await strip_audio_from_video(video_for_strip, reel_id)
                final_video_url = stripped_key
                logger.info(f"[Worker] Audio stripped (no overlay path)")
            except Exception as strip_err:
                logger.warning(f"[Worker] Audio strip failed, keeping original: {strip_err}")

        # ── Step 3: Generate Captions & Hashtags ─────────────────────────────
        if target in ["all", "caption", "upload"]:
            # Use the enriched video_prompt (includes product metadata) for richer captions.
            # Falls back to reel.prompt_text for upload/caption-only flows.
            caption_prompt = video_prompt if target in ["all", "video"] else reel.prompt_text
            ai_response = await generate_captions(
                prompt=caption_prompt,
                product_info=product_info,
                platform=platform,
            )
        else:
            ai_response = reel.caption_and_hashtags

        # ── Step 4: Persist completed reel ───────────────────────────────────
        update_reel(
            db,
            reel=reel,
            caption_and_hashtags=ai_response,
            final_commercial_video_url=final_video_url,
            status="Completed",
        )
        logger.info(f"Reel {reel_id} completed successfully")

    except Exception as e:
        logger.error(f"Error processing reel {reel_id}: {e}")
        reel = db.query(Reel).filter(Reel.reel_id == reel_id).first()
        if reel:
            update_reel(db, reel=reel, status="Failed", error_message=str(e))
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# LTX Video 2.3 Generation (Imagen 3 first frame → LTX animation)
# ─────────────────────────────────────────────────────────────────────────────

async def _run_ltx_generation(
    prompt: str,
    image_url: str | None,
    duration: int,
    with_audio: bool = False,
    reel_id: str = "unknown",
    product_image_bytes: list[tuple[bytes, str]] | None = None,
    imagen_prompt: str | None = None,
) -> str:
    """
    Generate a product reel using Imagen 3 (first frame) → LTX Video 2.3 (animation).

    Full pipeline:
        1. Imagen 3 + SUBJECT reference → cinematic 9:16 first frame (product-accurate)
        2. LTX Video 2.3 image-to-video → animate the Imagen 3 first frame (~30s fast)

    Two-prompt strategy:
        imagen_prompt (static): "Tiny green plankton keychain on dark zipper, close-up, bokeh"
            → Imagen 3 generates a product-faithful first frame using semantic understanding
        prompt (motion):        "A hand clips the keychain onto a zipper. Camera pushes in."
            → LTX animates the first frame into a cinematic scene

    Imagen 3 skipped when:
        - No product images available      → LTX text-to-video directly
        - GOOGLE_AI_API_KEY not set        → LTX uses raw product image URL
        - Imagen 3 API fails               → graceful degradation to raw product image
        - FAL_KEY not set                  → generate_video() facade (Veo / sample)

    Duration routing:
        ≤ 20s → generate_with_ltx()        (single API call — LTX 2.3 native)
        > 20s → generate_extended_ltx()    (chained clips via last-frame extraction)

    Args:
        prompt:               LTX motion prompt (200–350 chars, action-first, camera at end)
        image_url:            Primary product image URL — LTX fallback if Imagen fails
        duration:             Requested seconds (6, 10, 15, 30, 60)
        with_audio:           True = LTX generates native audio; False = silent video
        reel_id:              Reel UUID for R2 key naming in multi-clip concat
        product_image_bytes:  ALL product images as (bytes, mime_type) tuples —
                              first image used as Imagen 3 SUBJECT reference
        imagen_prompt:        Static first-frame description (product-focused, no motion).
                              Generated by generate_first_frame_prompt(). Falls back to
                              `prompt` if None.

    Returns:
        fal.media CDN URL  (single clip ≤ 20s)
        OR R2 object key   (multi-clip extend, proxied by /api/upload/videos/{key})
    """
    fal_key = os.getenv("FAL_KEY", "")

    # ── Fallback: no fal.ai key → use simple facade (Veo or sample) ──────────
    if not fal_key:
        logger.info("[LTX] No FAL_KEY, delegating to generate_video() facade")
        return await generate_video(prompt=prompt, image_url=image_url, duration=duration)

    # ── Step 1: Imagen 3 first frame ──────────────────────────────────────────
    # imagen_prompt (static, product-focused) describes the product and scene accurately.
    # The product photos are also provided as SUBJECT reference for semantic fidelity.
    # Falls back to the LTX motion prompt if imagen_prompt was not generated.
    ltx_image_url = image_url  # Default fallback = primary product image URL

    if product_image_bytes:
        effective_imagen_prompt = imagen_prompt or prompt
        logger.info(
            f"[Worker] Imagen 3 prompt: '{effective_imagen_prompt[:80]}...' "
            f"({'dedicated' if imagen_prompt else 'fallback=video prompt'})"
        )
        try:
            ltx_image_url = await generate_first_frame_with_imagen(
                prompt=effective_imagen_prompt,
                product_images=product_image_bytes,
            )
            logger.info(
                f"[Worker] ✅ Imagen 3 first frame ready "
                f"({len(product_image_bytes)} reference(s)) → passing to LTX"
            )
        except Exception as imagen_err:
            # Graceful degradation: Imagen 3 failed → LTX uses raw product image URL
            logger.warning(
                f"[Worker] Imagen 3 first frame failed, falling back to product image: {imagen_err}"
            )
            ltx_image_url = image_url

    mode = "image-to-video" if ltx_image_url else "text-to-video"

    # ── Step 2: LTX Video 2.3 animation ──────────────────────────────────────
    # LTX 2.3 natively supports up to 20s per call — extend chain only for > 20s.
    # with_audio maps directly to LTX's generate_audio param (no FFmpeg strip needed).
    if duration <= LTX_MAX_CLIP_DURATION:
        logger.info(f"[LTX] Single clip {mode} ({duration}s, audio={with_audio})")
        video_url = await generate_with_ltx(
            prompt=prompt,
            image_url=ltx_image_url,
            duration=duration,
            with_audio=with_audio,
        )
    else:
        num_clips = math.ceil(duration / LTX_MAX_CLIP_DURATION)
        logger.info(
            f"[LTX] Extended {mode}: {duration}s = {num_clips} clips "
            f"(audio={with_audio})"
        )
        video_url = await generate_extended_ltx(
            prompt=prompt,
            image_url=ltx_image_url,
            total_duration=duration,
            reel_id=reel_id,
            with_audio=with_audio,
        )

    logger.info(f"[LTX] Done: {video_url}")
    return video_url


# ─────────────────────────────────────────────────────────────────────────────
# Storage Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_product_image_bytes(
    image_urls: list[str],
) -> list[tuple[bytes, str]]:
    """
    Download product images from presigned R2 URLs and return as (bytes, mime_type) tuples.

    WHY: generate_first_frame_prompt() sends product photos to Gemini so it can SEE the
    actual product appearance (exact colour, shape, character details) rather than
    relying only on the text description.  This produces far more accurate first-frame
    descriptions for Imagen 3, and the same bytes are also used as the Imagen 3 SUBJECT
    reference for semantic product fidelity in the generated scene.

    Args:
        image_urls: List of presigned R2 URLs (already resolved by get_presigned_url()).
                    All URLs are fetched — more images give Gemini and Imagen 3 more
                    visual context for accurate product representation.

    Returns:
        List of (bytes, mime_type) tuples — only successfully downloaded images included.
        Empty list if all downloads fail (caller falls back to text-only prompt).
    """
    import httpx

    results: list[tuple[bytes, str]] = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for url in image_urls:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                # Determine MIME type from Content-Type header, default to JPEG
                mime = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                results.append((resp.content, mime))
                logger.debug(
                    f"[Worker] Fetched product image for Gemini: "
                    f"{len(resp.content):,} bytes ({mime})"
                )
            except Exception as e:
                logger.warning(f"[Worker] Failed to fetch product image for Gemini ({url[:60]}): {e}")
    logger.info(
        f"[Worker] Product images fetched for first-frame prompt: "
        f"{len(results)}/{len(image_urls)} succeeded"
    )
    return results


async def _upload_cdn_video_to_r2(cdn_url: str, reel_id: str) -> str:
    """
    Download a temporary CDN video (fal.ai, Veo) and upload it to R2.
    Returns the R2 object key for permanent storage.

    WHY this is needed instead of storing the CDN URL directly:
        - fal.ai CDN URLs expire in ~24h → raw_video_url becomes a broken link
        - CDN URLs hit the streaming path in the download endpoint, which is
          intercepted by IDM (Internet Download Manager) returning 204 without
          CORS headers → frontend fetch fails with "Failed to fetch"
        - R2 keys always resolve to a presigned URL (JSONResponse) →
          browser navigates to presigned URL → IDM downloads correctly

    Args:
        cdn_url:  Publicly accessible video URL (fal.ai CDN or similar)
        reel_id:  Reel UUID — used for the R2 object key naming

    Returns:
        R2 object key (e.g. "videos/reels/raw/.../reel_xxx_raw.mp4")

    Raises:
        httpx.HTTPError: If the CDN download fails
        RuntimeError:   If the R2 upload fails
    """
    import httpx
    from app.services.storage_service import upload_raw_bytes_to_r2

    logger.info(f"[Worker] Downloading raw video from CDN: {cdn_url[:80]}")
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(cdn_url)
        resp.raise_for_status()

    video_bytes = resp.content
    logger.info(f"[Worker] Downloaded {len(video_bytes):,} bytes — uploading to R2")

    # upload_raw_bytes_to_r2 is sync (boto3) — run in thread executor
    loop = asyncio.get_event_loop()
    key = await loop.run_in_executor(
        None,
        lambda: upload_raw_bytes_to_r2(
            data=video_bytes,
            filename=f"reel_{reel_id}_raw.mp4",
            prefix="videos/reels/raw",
            category=reel_id,
            return_key_only=True,
        ),
    )
    return key
