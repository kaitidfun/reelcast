"""
AI Service
==========
Handles AI-powered generation via Google Gemini:
  - Caption & hashtag generation (generate_captions)
  - Prompt generation from template + product context (generate_prompt_from_template)
  - Prompt enhancement from existing draft (enhance_prompt)
  - Guided prompt generation from chip selections + product image (generate_guided_prompt)
  - First-frame description for Imagen 3 (generate_first_frame_prompt)

Note: Video generation is in video_generation_service.py.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, Optional

from google import genai
from google.genai import types

# generate_video re-exported so existing callers that imported from here still work
from app.services.video_generation_service import generate_video  # noqa: F401

logger = logging.getLogger(__name__)

GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY")

# Template descriptions sent to Gemini to frame the generation goal.
# Each maps to the matching quick-prompt chip label in the frontend.
_TEMPLATE_DESCRIPTIONS = {
    "product_showcase": "a polished showcase that highlights the product's key features, design details, and unique selling points",
    "flash_sale":       "an urgent, high-energy flash sale with bold visual emphasis on the discount, countdown urgency, and clear call-to-action",
    "new_arrival":      "a stylish new-arrival announcement that builds excitement and curiosity around the product launch",
    "bundle_deal":      "a compelling bundle deal that communicates the value proposition of buying the combined products together",
    "review_highlight": "a social-proof video featuring top customer reviews and testimonials to build credibility and trust",
    "tutorial":         "a quick tutorial showing 2–3 practical ways to use or style the product in real-life scenarios",
}


def _get_client() -> genai.Client:
    if not GOOGLE_AI_API_KEY:
        raise ValueError("GOOGLE_AI_API_KEY is not set in environment variables.")
    return genai.Client(api_key=GOOGLE_AI_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

# Pipeline context prepended to the system prompt in all three video-prompt
# generation functions so Gemini understands the output will drive two models.
_LTX_PIPELINE_PREAMBLE = (
    "You are an expert prompt engineer for a two-stage AI video pipeline:\n"
    "  Stage 1 — Imagen 3 (text-to-image with product reference): generates a cinematic 9:16 first frame.\n"
    "  Stage 2 — LTX Video 2.3 fast (image-to-video): animates that frame (~30s).\n\n"
)


def _build_gemini_contents(
    text: str,
    images: list[tuple[bytes, str]] | None = None,
) -> list | str:
    """
    Build Gemini contents — multimodal (images first, then text) or text-only.

    WHY images-first: Gemini processes inputs in order. Placing product photos
    before the text prompt gives visual context before the instructions, which
    produces more accurate descriptions of specific product details.
    """
    imgs = images or []
    if not imgs:
        return text
    return [
        types.Part(inline_data=types.Blob(data=img_bytes, mime_type=img_mime))
        for img_bytes, img_mime in imgs
    ] + [types.Part(text=text)]


async def _run_gemini(
    contents,
    *,
    model: str = "gemini-3.5-flash",
    response_mime_type: str | None = None,
) -> str:
    """
    Run a synchronous Gemini generate_content call in a thread executor.

    WHY executor: google-genai uses blocking HTTP — calling it directly in
    an async function stalls the event loop for the full API round-trip
    (~0.5–3s), blocking all other concurrent tasks in the Celery worker.
    """
    client = _get_client()
    config = (
        types.GenerateContentConfig(response_mime_type=response_mime_type)
        if response_mime_type
        else None
    )

    def _call() -> str:
        kwargs: dict = {"model": model, "contents": contents}
        if config:
            kwargs["config"] = config
        return client.models.generate_content(**kwargs).text  # type: ignore[return-value]

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _call)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def generate_captions(prompt: str, product_info: str, platform: str) -> Dict[str, Any]:
    """
    Generate platform-optimized captions and hashtags using Google Gemini.

    Produces social media captions tailored to specific platform best practices:
        - Instagram (ig): Max 1600 chars, optimized for discoverability
        - Facebook (fb): Optimized for engagement and shareability
        - TikTok (tt): Punchy, trend-aware, algorithm-friendly
        - YouTube Shorts (yt): Clear, searchable descriptions

    Args:
        prompt: User's text prompt for the reel (max 500 chars)
        product_info: Product description/metadata to include in context
        platform: Target platform (ig/fb/tt/yt) for optimization

    Returns:
        Dict with keys:
            - caption: Platform-optimized caption
            - hashtags: List of exactly 4 relevant hashtags (with # prefix)

    Raises:
        Returns fallback mock response if GOOGLE_AI_API_KEY not configured
    """
    if not GOOGLE_AI_API_KEY:
        logger.warning("GOOGLE_AI_API_KEY not set, using mock caption response")
        await asyncio.sleep(1)
        return {
            "caption": f"Check out this amazing product! {prompt[:50]}...",
            "hashtags": ["#trending", "#musthave", "#reelcast", "#shopnow"]
        }

    system_prompt = f"""You are an expert social media marketer. Generate a caption and hashtags based on the user's prompt and product details.
Target Platform: {platform}

Rules:
- If platform is Instagram (ig), the caption must be strictly under 1600 characters.
- If platform is Facebook (fb), optimize for engagement and shareability.
- If platform is TikTok (tt), make it punchy and trend-aware.
- If platform is YouTube Shorts (yt), write a clear, searchable description.
- Provide exactly 4 relevant hashtags (include the # sign).
- Return ONLY strict JSON with keys: "caption" (string) and "hashtags" (list of strings). No extra text.
"""
    full_prompt = system_prompt + "\n\n" + f"User Prompt: {prompt}\nProduct Details: {product_info}"

    try:
        logger.info(f"Generating captions for platform: {platform}")
        result_text = await _run_gemini(full_prompt, response_mime_type="application/json")
        result = json.loads(result_text)
        logger.info(
            f"Captions generated for {platform}: "
            f"{len(result.get('caption', ''))} chars, {len(result.get('hashtags', []))} hashtags"
        )
        return result
    except Exception as e:
        logger.error(f"Error generating caption: {e}")
        return {
            "caption": f"Check out this amazing product! {prompt[:50]}...",
            "hashtags": ["#trending", "#musthave", "#reelcast", "#shopnow"]
        }


async def generate_prompt_from_template(
    template_type: str,
    product_name: str,
    product_description: str,
    duration: int = 30,
    product_images: list[tuple[bytes, str]] | None = None,
) -> str:
    """
    Generate a video prompt tailored to a quick-prompt template + product context.

    Called when the user clicks a quick-prompt chip (Product Showcase, Flash Sale, etc.).
    When product_images is provided the request is multimodal — Gemini sees all
    product photos and can reference their colours, shapes, and packaging details
    directly, producing more specific and visually accurate prompts.

    Args:
        template_type:        One of the keys in _TEMPLATE_DESCRIPTIONS (e.g. "flash_sale")
        product_name:         Name of the selected product
        product_description:  Product highlights/description from the library
        duration:             Requested video length in seconds
        product_images:  List of (bytes, mime_type) tuples for ALL product images,
                         sorted primary-first (up to 4). Gemini receives every image
                         so it can reference multiple angles and views of the product.
                         Empty list = text-only fallback.

    Returns:
        Generated prompt string (≤ 500 chars). Falls back to a static template on error.
    """
    template_desc = _TEMPLATE_DESCRIPTIONS.get(template_type, "a promotional video")
    fallback = (
        f"Create a {duration}-second cinematic Reel for {product_name or 'the product'} — "
        f"{template_desc}. Use dynamic transitions, premium lighting, and a compelling call-to-action."
    )

    if not GOOGLE_AI_API_KEY:
        logger.warning("GOOGLE_AI_API_KEY not set — returning static fallback prompt")
        return fallback

    # Generate a SCENE + MOTION DESCRIPTION optimised for LTX Video 2.3.
    #
    # LTX 2.3 fast (~30s generation) uses this as both a scene reference and a
    # motion guide. Works best with short, motion-first prompts ending with an
    # explicit camera instruction.
    #
    # Key LTX 2.3 prompt principles:
    #   - SHORT (200–350 chars): LTX works best with concise prompts
    #   - MOTION FIRST: lead with the action, then describe the scene
    #   - CAMERA AT THE END: always end with a camera movement instruction
    #   - For >10s extend chains: use cyclic/ambient motion (slow drift, gentle
    #     rotation) — directional motion (zoom in, dolly) breaks across clips
    system_prompt = (
        _LTX_PIPELINE_PREAMBLE
        + "YOUR JOB: Write the scene prompt that drives BOTH stages.\n\n"
        "CRITICAL RULES:\n"
        "- DO NOT describe the product's appearance (colour, shape, material, logo).\n"
        "  Product PHOTOS are already provided as SUBJECT reference to Imagen 3.\n"
        "- DO describe: ACTION, SCENE, ENVIRONMENT, PEOPLE, ATMOSPHERE, LIGHTING\n"
        "- MOTION FIRST: start with the main action, then describe the setting\n"
        "- ALWAYS end with an explicit camera instruction:\n"
        "  'Camera slowly pushes in.', 'Smooth orbit around subject.', 'Camera pulls back.'\n"
        "- ONE continuous shot — no cuts, no transitions\n\n"
        "GOOD examples:\n"
        "  'A woman lifts the product, glances at the camera, smiles. Sunlit café. Crowd blurred behind. "
        "Camera slowly dollies in.'\n"
        "  'Hand places product on dark marble. Steam curls upward. Warm backlight. "
        "Camera pulls back to reveal full scene.'\n\n"
        "BAD: 'A red leather handbag with gold zippers on a white surface.' "
        "← never describe product appearance\n\n"
        "Requirements:\n"
        "- 200–350 characters (SHORT is better for LTX — do NOT pad to 500)\n"
        "- Always include camera movement + subject motion\n"
        "- Describe people naturally interacting with the product if it fits the goal\n"
        "- Do NOT include hashtags, captions, pricing, or platform names\n"
        "- Return ONLY the prompt text — no explanation, no quotes"
    )
    user_content = (
        f"Goal: {template_desc}\n"
        f"Product name: {product_name or 'unspecified'}\n"
        f"Product details: {product_description or 'no additional details'}\n"
        f"Duration: {duration} seconds\n"
        f"Remember: describe SCENE + ACTION + ATMOSPHERE only — not what the product looks like."
    )

    try:
        contents = _build_gemini_contents(
            system_prompt + "\n\n" + user_content,
            product_images,
        )
        result = (await _run_gemini(contents))[:500]
        logger.info(
            f"Template prompt generated ({template_type}, {len(result)} chars, "
            f"{len(product_images or [])} image(s))"
        )
        return result
    except Exception as e:
        logger.error(f"Error generating template prompt: {e}")
        return fallback


async def enhance_prompt(
    prompt_text: str,
    product_name: str = "",
    product_description: str = "",
    duration: int = 30,
    product_images: list[tuple[bytes, str]] | None = None,
) -> str:
    """
    Improve the user's prompt using Gemini to make it more cinematic and production-ready.

    Called when the user clicks the "Enhance" button. Gemini rewrites the draft to
    include professional creative direction — specific camera movements, lighting style,
    visual transitions — while preserving the user's original concept.
    When product_images is provided the request is multimodal so Gemini can
    reference the product's actual visual appearance in the improved prompt.

    Args:
        prompt_text:          The user's current draft (may be rough or short)
        product_name:         Product name for additional context (optional)
        product_description:  Product highlights for additional context (optional)
        duration:             Requested video length in seconds
        product_images:  List of (bytes, mime_type) tuples for ALL product images,
                         sorted primary-first (up to 4). Gemini sees every image
                         for richer visual context. Empty list = text-only.

    Returns:
        Improved prompt string (≤ 500 chars). Returns original prompt on error.
    """
    if not GOOGLE_AI_API_KEY:
        logger.warning("GOOGLE_AI_API_KEY not set — returning locally enhanced prompt")
        return (
            f"Create a cinematic {duration}-second vertical Reel: {prompt_text.strip()}. "
            "Use dynamic camera moves, premium lighting, hero product close-ups, "
            "vibrant color grading, and a strong call-to-action."
        )[:500]

    # Enhance the user's prompt for the two-stage pipeline:
    # Imagen 3 (first frame) → LTX Video 2.3 (animation).
    # LTX works best with short, motion-first prompts ending with a camera instruction.
    system_prompt = (
        _LTX_PIPELINE_PREAMBLE
        + "YOUR JOB: Rewrite the user's prompt while keeping their core idea.\n\n"
        "CRITICAL RULES:\n"
        "- DO NOT describe the product's appearance (colour, material, shape, logo).\n"
        "  Product photos are already provided as SUBJECT reference to Imagen 3.\n"
        "- DO describe: ACTION, SCENE, ENVIRONMENT, PEOPLE, ATMOSPHERE, LIGHTING\n"
        "- MOTION FIRST: lead with the main action, then describe the setting\n"
        "- ALWAYS end with an explicit camera instruction:\n"
        "  'Camera slowly pushes in.', 'Smooth orbit.', 'Camera pulls back to reveal scene.'\n"
        "- ONE continuous shot — no cuts, no transitions\n"
        "- Replace vague adjectives ('cinematic', 'premium') with concrete scene details\n\n"
        "GOOD: 'A woman in a café lifts the product toward the camera, smiling softly. "
        "Warm morning light. Background bokeh. Camera slowly pushes in.'\n"
        "BAD: 'A sleek black bottle with minimalist design and premium feel.' ← never this\n\n"
        "Requirements:\n"
        "- 200–350 characters (SHORT is better for LTX — do NOT pad to 500)\n"
        "- Always include camera movement + motion\n"
        "- Do NOT include hashtags, captions, or pricing\n"
        "- Return ONLY the improved prompt — no explanation, no quotes"
    )

    context = ""
    if product_name:
        context += f"\nProduct: {product_name}"
    if product_description:
        context += f"\nProduct details: {product_description}"

    user_content = (
        f"Original prompt: {prompt_text}\n"
        f"Duration: {duration} seconds"
        + context
    )

    try:
        contents = _build_gemini_contents(
            system_prompt + "\n\n" + user_content,
            product_images,
        )
        result = (await _run_gemini(contents))[:500]
        logger.info(
            f"Prompt improved: {len(prompt_text)} → {len(result)} chars, "
            f"{len(product_images or [])} image(s)"
        )
        return result
    except Exception as e:
        logger.error(f"Error improving prompt: {e}")
        return prompt_text  # Return original if improvement fails


async def generate_guided_prompt(
    mood: Optional[str] = None,
    target: Optional[str] = None,
    style: Optional[str] = None,
    focus: Optional[str] = None,
    lighting: Optional[str] = None,
    camera_motion: Optional[str] = None,
    product_name: str = "",
    product_description: str = "",
    product_images: list[tuple[bytes, str]] | None = None,
    duration: int = 30,
) -> str:
    """
    Generate a production-ready video prompt from Guide Me card selections + product context.

    Sends all selected creative preferences and full product details (including image)
    to Gemini as a multimodal request.  Gemini sees the actual product photo and can
    reference its visual appearance in the generated prompt — much richer output than
    text-only generation.

    Args:
        mood:                 Selected Mood/Vibe card label (e.g. "Luxury & Premium")
        target:               Selected Target Audience card label
        style:                Selected Visual Style card label
        focus:                Selected Scene Focus card label
        lighting:             Selected Lighting & Environment card label (e.g. "Golden Hour")
        camera_motion:        Selected Camera Motion card label (e.g. "Slow Zoom In")
        product_name:         Product name from the library
        product_description:  Product description/highlights
        product_images:  List of (bytes, mime_type) tuples for ALL product images,
                         sorted primary-first (up to 4 images)
        duration:             Requested video length in seconds

    Returns:
        Generated video prompt string (≤ 500 chars, hard-capped)

    Falls back to a locally-assembled prompt if Gemini is unavailable.
    """
    selections = []
    if mood:          selections.append(f"Mood/Vibe: {mood}")
    if style:         selections.append(f"Visual Style: {style}")
    if focus:         selections.append(f"Scene Focus: {focus}")
    if target:        selections.append(f"Target Audience: {target}")
    if lighting:      selections.append(f"Lighting & Environment: {lighting}")
    if camera_motion: selections.append(f"Camera Motion: {camera_motion}")

    def _local_fallback() -> str:
        parts = ", ".join(s.split(": ", 1)[-1] for s in selections) if selections else "dynamic and engaging"
        return (
            f"Create a {duration}-second vertical Reel for {product_name or 'the featured product'}. "
            f"Style: {parts}. Highlight the product's best features with premium lighting, "
            "smooth transitions, and a strong call-to-action."
        )[:500]

    if not GOOGLE_AI_API_KEY:
        logger.warning("GOOGLE_AI_API_KEY not set — returning locally-assembled guided prompt")
        return _local_fallback()

    # Generate a LTX Video 2.3 optimised scene + motion prompt from the creative chips.
    # LTX works best with short, motion-first prompts ending with a camera instruction.
    # Camera Motion chip (if selected) must appear verbatim at the end of the prompt.
    system_prompt = (
        _LTX_PIPELINE_PREAMBLE
        + "YOUR JOB: Translate the creative chips below into a concrete scene prompt.\n\n"
        "CRITICAL RULES:\n"
        "- DO NOT describe the product's appearance (colour, material, shape, logo).\n"
        "  Product photos are provided as SUBJECT reference to Imagen 3.\n"
        "- DO describe: ACTION, SCENE, ENVIRONMENT, PEOPLE, ATMOSPHERE, LIGHTING\n"
        "- MOTION FIRST: start with the main action, then describe the setting\n"
        "- ALWAYS end with an explicit camera instruction matching the Camera Motion chip.\n"
        "  If no Camera Motion chip selected, add a gentle default camera movement.\n"
        "- ONE continuous shot — no cuts, no transitions\n"
        "- Translate abstract chips into CONCRETE scene details:\n"
        "  'Luxury & Premium' → marble surface, warm spotlight, model's hand beside product\n"
        "  'Fun & Energetic' → bright outdoor, person running with product, vivid light\n"
        "  'Eco & Natural' → forest clearing, person crouching with product, soft natural light\n"
        "  'Dark & Mysterious' → dim room, single shaft of light, slow product reveal\n"
        "  'Dreamy / Soft' → soft bokeh, pastel tones, gentle breeze, floating feel\n"
        "  'Slow Zoom In' → 'Camera slowly zooms in.'\n"
        "  'Orbit / Rotate' → 'Camera orbits around the subject slowly.'\n"
        "  'Dolly Right' → 'Camera slides right, revealing the scene.'\n"
        "  'Pull Back / Reveal' → 'Camera slowly pulls back to reveal the full scene.'\n"
        "  'Handheld Drift' → 'Gentle handheld drift, organic movement.'\n"
        "  'Static Close-up' → 'Camera holds still, tight frame on subject.'\n\n"
        "GOOD: 'A woman lifts the product, smiles at camera. Sunlit park, golden hour. "
        "Leaves flutter. Camera slowly dollies in.'\n"
        "BAD: 'A gold lipstick on velvet with luxury feel.' ← never describe product appearance\n\n"
        "Requirements:\n"
        "- 200–350 characters (SHORT is better for LTX — do NOT pad)\n"
        "- Always include camera movement + motion\n"
        "- Do NOT include hashtags, captions, platform names, or pricing\n"
        "- Return ONLY the prompt text — no explanation, no quotes"
    )

    context_parts = [f"Duration: {duration} seconds"]
    if product_name:        context_parts.append(f"Product name: {product_name}")
    if product_description: context_parts.append(f"Product details: {product_description}")
    context_parts.extend(selections)

    try:
        contents = _build_gemini_contents(
            system_prompt + "\n\n" + "\n".join(context_parts),
            product_images,
        )
        result = (await _run_gemini(contents))[:500]
        logger.info(f"Guided prompt generated ({len(result)} chars, {len(product_images or [])} image(s))")
        return result
    except Exception as e:
        logger.error(f"Error generating guided prompt: {e}")
        return _local_fallback()


async def generate_first_frame_prompt(
    video_prompt: str,
    product_name: str = "",
    product_description: str = "",
    product_images: list[tuple[bytes, str]] | None = None,
) -> str:
    """
    Convert a motion-oriented video prompt into a static first-frame description for Imagen 3.

    WHY this is needed:
        The video prompt is written for LTX animation ("A hand clips the keychain onto
        the zipper. Backpack bounces as a teenager walks...") — it's motion-forward and
        doesn't describe what the product looks like in the opening frame.

        Imagen 3 needs a STATIC SCENE DESCRIPTION to produce an accurate first frame.
        A product-specific description ("Tiny green plankton keychain clipped to a dark
        zipper, close-up, school corridor bokeh") combined with the SUBJECT reference
        image gives Imagen 3 both semantic and visual product context.

        When product_images is provided, this call is MULTIMODAL — Gemini actually SEES
        the product photos and can describe the product's exact appearance (colour, shape,
        texture, character face, logo details) rather than relying only on the text name.
        This produces a far more accurate first-frame description for Imagen 3.

    Args:
        video_prompt:        LTX motion prompt (the prompt user sees + product name appended)
        product_name:        Product name from the library (e.g. "fuggler: plankton")
        product_description: Product description (e.g. "ugly cute plankton, Spongebob show")
        product_images:      List of (bytes, mime_type) tuples — all product photos.
                             When provided, Gemini sees the actual product images and can
                             describe exact colours, shapes, and distinguishing features.

    Returns:
        Static first-frame description (120–220 chars) for Imagen 3.
        Falls back to a simple product-focused description on any error.
    """
    fallback = (
        f"{product_name or 'product'} as the main subject, "
        f"product in sharp focus, cinematic scene, 9:16 portrait"
    )[:220]

    if not GOOGLE_AI_API_KEY:
        return fallback

    imgs = product_images or []

    # Adjust instruction based on whether Gemini can actually see the product.
    if imgs:
        visual_instruction = (
            "IMPORTANT: Product photos are attached. Study them carefully.\n"
            "Describe the product's EXACT appearance from the photos:\n"
            "  - Precise colours (e.g. 'matte olive green', 'translucent pink')\n"
            "  - Shape and form (e.g. 'round with protruding teeth', 'tall cylinder')\n"
            "  - Distinguishing details (e.g. 'one large eye, white pupils', 'embossed logo')\n"
            "This level of detail helps Imagen 3 generate a product-accurate first frame.\n"
        )
    else:
        visual_instruction = (
            "No product photos provided — base your description on the product name\n"
            "and description text only. Be as specific as the text allows.\n"
        )

    system_prompt = (
        "You are writing a FIRST-FRAME DESCRIPTION for a product video reel.\n\n"
        "This still image is generated by Imagen 3 (Google) and becomes the opening\n"
        "frame of the video. The product photo is also provided as a SUBJECT reference\n"
        "so Imagen 3 can recreate the product faithfully in the generated scene.\n"
        "Your description tells Imagen 3 WHERE the product is and WHAT SCENE it's in.\n\n"
        + visual_instruction + "\n"
        "RULES:\n"
        "1. Product MUST be the clear focal point — clearly visible, recognisable\n"
        "2. Describe the product's specific visual appearance (colour, shape, character details)\n"
        "3. Set the scene / environment to match the video prompt\n"
        "4. NO motion words — this is a STILL IMAGE (no 'bounces', 'walks', 'clips')\n"
        "5. Portrait 9:16 vertical composition, product in foreground\n"
        "6. 120–220 characters — concise and visual\n"
        "7. Return ONLY the scene description — no quotes, no explanation\n\n"
        "GOOD example:\n"
        "  Product: green plankton keychain, cute oversized teeth, Spongebob show\n"
        "  Video: 'A hand clips the keychain onto a school bag zipper'\n"
        "  → 'Tiny green plankton character keychain resting on a dark zipper pull, "
        "close-up, blurred school corridor, warm afternoon light'\n\n"
        "BAD example:\n"
        "  → 'A keychain on a bag' ← too vague, product not described\n"
        "  → 'A hand clips the keychain' ← motion word, not a still image"
    )

    user_content = (
        f"Product name: {product_name or 'unspecified'}\n"
        f"Product description: {product_description or 'no description'}\n"
        f"Video prompt (for scene context): {video_prompt}"
    )

    try:
        contents = _build_gemini_contents(
            system_prompt + "\n\n" + user_content,
            product_images,
        )
        result = (await _run_gemini(contents))[:220]
        logger.info(
            f"[FirstFramePrompt] Generated ({len(result)} chars, {len(imgs)} image(s)): "
            f"{result[:80]}..."
        )
        return result
    except Exception as e:
        logger.warning(f"[FirstFramePrompt] Failed, using fallback: {e}")
        return fallback
