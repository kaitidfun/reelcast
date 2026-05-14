"""
AI Service
==========
Handles AI-powered caption and hashtag generation via Google Gemini.

Note: Video generation moved to video_generation_service.py for separation of concerns.
"""

import os
import asyncio
import json
import logging
from typing import Dict, Any
from google import genai
from google.genai import types

# For backward compatibility, re-export video generation from new service
from app.services.video_generation_service import generate_video  # noqa: F401

logger = logging.getLogger(__name__)

# Configure Gemini with AI Studio Key — reads GOOGLE_AI_API_KEY from .env
GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY")

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
