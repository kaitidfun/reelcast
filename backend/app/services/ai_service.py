"""
AI Service
==========
Handles AI-powered generation via Google Gemini:
  - Caption & hashtag generation (generate_captions)
  - Prompt generation from template + product context (generate_prompt_from_template)
  - Prompt enhancement from existing draft (enhance_prompt)
  - Guided prompt generation from chip selections + product image (generate_guided_prompt)

Note: Video generation moved to video_generation_service.py for separation of concerns.
"""

import os
import asyncio
import json
import logging
from typing import Dict, Any, Optional
from google import genai
from google.genai import types

# For backward compatibility, re-export video generation from new service
from app.services.video_generation_service import generate_video  # noqa: F401

logger = logging.getLogger(__name__)

# Configure Gemini with AI Studio Key — reads GOOGLE_AI_API_KEY from .env
GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY")

# Template descriptions sent to Gemini to frame the generation goal
# Each maps to the matching quick-prompt chip label in the frontend
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
        # Fallback mock response if no key is configured
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

    user_content = f"User Prompt: {prompt}\nProduct Details: {product_info}"
    full_prompt = system_prompt + "\n\n" + user_content

    try:
        logger.info(f"Generating captions for platform: {platform}")
        client = _get_client()

        def _generate():
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                )
            )
            return response.text

        loop = asyncio.get_event_loop()
        result_text = await loop.run_in_executor(None, _generate)
        result = json.loads(result_text)
        logger.info(f"Captions generated for {platform}: {len(result.get('caption', ''))} chars, {len(result.get('hashtags', []))} hashtags")
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

    # Always generate a literal SCENE DESCRIPTION.
    #
    # Why: The generated prompt serves two purposes in the 2-step pipeline —
    #   (1) Passed to Bria background/replace as the scene description
    #       (tells Bria what environment to build around the product)
    #   (2) Passed directly to LTX text-to-video when no product image exists
    #
    # Scene descriptions work for both paths. LTX step uses a separate fixed
    # motion prompt when a Bria scene image is available (see worker.py).
    system_prompt = (
        "You are an expert prompt engineer for AI video generation models (LTX Video, Wan, Kling). "
        "Write a single video generation prompt that these models can render accurately.\n\n"
        "CRITICAL — AI video models render what they literally 'see', not filmmaking concepts:\n"
        "- Describe the PHYSICAL SCENE: what objects exist, their material/colour/shape/position\n"
        "- Describe the ENVIRONMENT: surface, background, surrounding props, setting\n"
        "- Describe ONE continuous shot — no scene cuts, no 'transitions', no 'montage'\n"
        "- Describe the PRIMARY MOTION: what moves, how it moves, how slowly/quickly\n"
        "- Describe LIGHTING concretely: 'warm sunlight from the left', 'soft white studio light'\n"
        "- Use SIMPLE, LITERAL language — avoid abstract filmmaking terms like 'cinematic'\n"
        "- Start with the main subject and its environment, then describe the motion\n\n"
        "BAD: 'Cinematic product showcase with dynamic transitions and premium lighting'\n"
        "GOOD: 'A glass perfume bottle sits on white marble. Sunlight catches the glass facets. "
        "The bottle slowly rotates. Soft white fabric drapes in the background.'\n\n"
        "Requirements:\n"
        "- STRICTLY under 500 characters\n"
        "- If product image provided, reference its actual colour, shape, and material\n"
        "- Clearly describe the environment around the product (surface, setting, atmosphere)\n"
        "- Do NOT include hashtags, captions, pricing, or platform names\n"
        "- Return ONLY the prompt text — no explanation, no quotes"
    )
    user_content = (
        f"Goal: {template_desc}\n"
        f"Product name: {product_name or 'unspecified'}\n"
        f"Product details: {product_description or 'no additional details'}\n"
        f"Duration: {duration} seconds\n"
        f"Remember: describe the literal scene (subject + environment + motion) — not filmmaking direction."
    )

    try:
        client = _get_client()

        def _generate():
            imgs = product_images or []
            if imgs:
                # Multimodal: all product images first, then the text prompt
                # Gemini sees every angle/view of the product for richer visual prompts
                contents = [
                    types.Part(
                        inline_data=types.Blob(data=img_bytes, mime_type=img_mime)
                    )
                    for img_bytes, img_mime in imgs
                ] + [types.Part(text=system_prompt + "\n\n" + user_content)]
            else:
                contents = system_prompt + "\n\n" + user_content

            return client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
            ).text.strip()

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _generate)
        result = result[:500]
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

    # Always generate a literal SCENE DESCRIPTION.
    # The prompt serves as (1) Bria scene context when product image exists,
    # and (2) full scene brief for LTX text-to-video when no image is available.
    system_prompt = (
        "You are an expert prompt engineer for AI video generation models (LTX Video, Wan, Kling). "
        "Rewrite the user's prompt so an AI video model can render it accurately.\n\n"
        "CRITICAL — AI video models render what they literally 'see':\n"
        "- Keep the user's core idea, but rewrite it as a LITERAL SCENE DESCRIPTION\n"
        "- Describe what PHYSICALLY EXISTS: objects, materials, colours, positions\n"
        "- Describe the ENVIRONMENT: surface, background, props, lighting\n"
        "- ONE continuous shot — remove any scene cuts, transitions, or 'montage'\n"
        "- Describe the PRIMARY MOTION clearly: what moves, how it moves\n"
        "- Replace abstract terms ('cinematic', 'premium') with concrete details\n"
        "- Start with the subject and its environment, then describe the motion\n\n"
        "BAD: 'Dynamic product showcase with cinematic transitions and premium lighting'\n"
        "GOOD: 'A black skincare bottle on a dark wooden surface. Soft warm light from the right. "
        "The bottle rotates slowly revealing the label. A water droplet runs down the glass.'\n\n"
        "Requirements:\n"
        "- STRICTLY under 500 characters\n"
        "- If product image provided, reference its actual colour, shape, and material\n"
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
        client = _get_client()

        def _generate():
            imgs = product_images or []
            if imgs:
                contents = [
                    types.Part(
                        inline_data=types.Blob(data=img_bytes, mime_type=img_mime)
                    )
                    for img_bytes, img_mime in imgs
                ] + [types.Part(text=system_prompt + "\n\n" + user_content)]
            else:
                contents = system_prompt + "\n\n" + user_content

            return client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
            ).text.strip()

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _generate)
        result = result[:500]
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
        product_name:         Product name from the library
        product_description:  Product description/highlights
        product_images:  List of (bytes, mime_type) tuples for ALL product images,
                         sorted primary-first (up to 4 images)
        duration:             Requested video length in seconds

    Returns:
        Generated video prompt string (≤ 500 chars, hard-capped)

    Falls back to a locally-assembled prompt if Gemini is unavailable.
    """
    # Build the creative-direction selections the user picked
    selections = []
    if mood:     selections.append(f"Mood/Vibe: {mood}")
    if style:    selections.append(f"Visual Style: {style}")
    if focus:    selections.append(f"Scene Focus: {focus}")
    if target:   selections.append(f"Target Audience: {target}")
    if lighting: selections.append(f"Lighting & Environment: {lighting}")

    # Local fallback: build prompt without Gemini
    def _local_fallback() -> str:
        parts = ", ".join(s.split(": ", 1)[-1] for s in selections) if selections else "dynamic and engaging"
        return (
            f"Create a {duration}-second vertical Reel for {product_name or 'the featured product'}. "
            f"Style: {parts}. Highlight the product's best features with premium lighting, "
            "smooth transitions, and a strong call-to-action."
        )[:500]

    imgs = product_images or []

    if not GOOGLE_AI_API_KEY:
        logger.warning("GOOGLE_AI_API_KEY not set — returning locally-assembled guided prompt")
        return _local_fallback()

    # Always generate a literal SCENE DESCRIPTION.
    # Translate the creative chips (mood, style, lighting) into concrete scene details.
    # The prompt serves as (1) Bria scene context when product image exists, and
    # (2) full scene brief for LTX text-to-video when no image is available.
    system_prompt = (
        "You are an expert prompt engineer for AI video generation models (LTX Video, Wan, Kling). "
        "Generate a video prompt based on the creative brief below that an AI model can render accurately.\n\n"
        "CRITICAL — AI video models render what they literally 'see':\n"
        "- Write ONE continuous shot — no cuts, no 'transitions', no 'montage'\n"
        "- Describe the PHYSICAL SCENE: what objects exist, their material/colour/position\n"
        "- Describe the ENVIRONMENT: surface, background, surrounding props, setting\n"
        "- Describe the PRIMARY MOTION: what moves, how it moves, how fast/slow\n"
        "- Translate creative chips into CONCRETE details:\n"
        "  'Luxury' → marble surface, gold accents, warm spotlight\n"
        "  'Energetic' → bright daylight, vivid colours, fast product movement\n"
        "  'Minimal' → white surface, single object, clean background\n"
        "- Use LITERAL language — replace 'cinematic' with actual scene details\n\n"
        "BAD: 'Luxurious product showcase with dramatic lighting and premium feel'\n"
        "GOOD: 'A gold lipstick tube on a black velvet surface. Soft spotlight from above. "
        "The cap is removed slowly revealing the deep red bullet. Light reflects off the metallic surface.'\n\n"
        "Requirements:\n"
        "- STRICTLY under 500 characters\n"
        "- If product image provided, reference its actual colour, shape, and material\n"
        "- Do NOT include hashtags, captions, platform names, or pricing\n"
        "- Return ONLY the prompt text — no explanation, no quotes"
    )

    context_parts = [f"Duration: {duration} seconds"]
    if product_name:        context_parts.append(f"Product name: {product_name}")
    if product_description: context_parts.append(f"Product details: {product_description}")
    context_parts.extend(selections)
    user_content = system_prompt + "\n\n" + "\n".join(context_parts)

    try:
        client = _get_client()

        def _generate():
            if imgs:
                # Multimodal: all product images first, then the creative brief
                # Gemini sees every angle/view for richer, more visually specific prompts
                contents = [
                    types.Part(
                        inline_data=types.Blob(data=img_bytes, mime_type=img_mime)
                    )
                    for img_bytes, img_mime in imgs
                ] + [types.Part(text=user_content)]
            else:
                contents = user_content

            return client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
            ).text.strip()

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _generate)
        result = result[:500]
        logger.info(f"Guided prompt generated ({len(result)} chars, {len(imgs)} image(s))")
        return result

    except Exception as e:
        logger.error(f"Error generating guided prompt: {e}")
        return _local_fallback()
