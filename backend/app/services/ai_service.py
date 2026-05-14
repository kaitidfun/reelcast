import os
import asyncio
import json
from typing import Dict, Any
from google import genai
from google.genai import types

# Configure Gemini with AI Studio Key — reads GOOGLE_AI_API_KEY from .env
GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY")

def _get_client() -> genai.Client:
    if not GOOGLE_AI_API_KEY:
        raise ValueError("GOOGLE_AI_API_KEY is not set in environment variables.")
    return genai.Client(api_key=GOOGLE_AI_API_KEY)


async def generate_captions(prompt: str, product_info: str, platform: str) -> Dict[str, Any]:
    """
    Generate platform-optimized captions and hashtags using Google Gemini.

    Args:
        prompt: User's text prompt for the reel (max 500 chars)
        product_info: Product description/metadata to include in context
        platform: Target platform (ig/fb/tt/yt) for optimization

    Returns:
        Dict with keys:
            - caption: Platform-optimized caption (max 1600 chars for Instagram)
            - hashtags: List of exactly 4 relevant hashtags (with # prefix)

    Raises:
        Returns fallback mock response if GOOGLE_AI_API_KEY not configured
    """
    if not GOOGLE_AI_API_KEY:
        # Fallback mock response if no key is configured
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
        return json.loads(result_text)

    except Exception as e:
        print(f"Error generating caption: {e}")
        return {
            "caption": f"Check out this amazing product! {prompt[:50]}...",
            "hashtags": ["#trending", "#musthave", "#reelcast", "#shopnow"]
        }



async def generate_video(
    prompt: str,
    image_url: str = None,
    resolution: str = "720p",
    duration: int = 30,
) -> str:
    """
    Generate short-form video Reel using AI (priority order: fal.ai → Veo → sample).

    Priority order (attempt in sequence):
        1. fal.ai Wan 2.1      — Fast & cheap (~฿0.5/video), returns public URL
        2. Google Veo 2.0      — Best quality (~฿63/video), uploads to R2 storage
        3. Sample fallback     — Free, no AI, for development/testing

    Args:
        prompt: User's creative brief (enriched with product metadata)
        image_url: Optional reference image for style guidance
        resolution: Output resolution (480p/720p/1080p) — default 720p per SRS min requirement
        duration: Video length in seconds (15/30/60) — capped at 30s for 1.3b model

    Returns:
        Public URL to the generated video (playable, vertical 9:16 format)

    Raises:
        Returns fallback sample video if all providers fail
    """
    fal_key     = os.getenv("FAL_KEY", "")
    veo_enabled = os.getenv("VEO_ENABLED", "false").lower() == "true"

    # ──────────────────────────────────────────────
    # Option 1: fal.ai  (cheap & fast)
    # ──────────────────────────────────────────────
    if fal_key:
        try:
            import fal_client
            os.environ["FAL_KEY"] = fal_key  # ensure env var is set for the SDK

            # num_frames capped at 480 (30 s) for the 1.3b model; SRS max is 60 s
            num_frames = min(duration * 16, 480)
            print(f"[fal.ai] Starting Wan 2.1 — {resolution}, {duration}s ({num_frames} frames)")

            def _run_fal():
                result = fal_client.run(
                    "fal-ai/wan/v2.1/1.3b",
                    arguments={
                        "prompt": prompt,
                        "num_frames": num_frames,
                        "frames_per_second": 16,
                        "resolution": resolution,
                        "aspect_ratio": "9:16",
                    },
                )
                return result["video"]["url"]

            loop = asyncio.get_event_loop()
            video_url = await loop.run_in_executor(None, _run_fal)
            print(f"[fal.ai] Video ready: {video_url}")
            return video_url

        except Exception as e:
            print(f"[fal.ai] Error: {e} — falling back to next option.")

    # ──────────────────────────────────────────────
    # Option 2: Google Veo  (best quality, pricey)
    # ──────────────────────────────────────────────
    if veo_enabled and GOOGLE_AI_API_KEY:
        try:
            client = _get_client()
            print(f"[Veo] Starting video generation: {prompt[:80]}...")

            def _generate_and_upload_sync():
                import time, uuid, requests, boto3

                operation = client.models.generate_videos(
                    model="veo-2.0-generate-001",
                    prompt=prompt,
                    config={"number_of_videos": 1},
                )
                max_wait, waited = 300, 0
                while not operation.done and waited < max_wait:
                    time.sleep(10)
                    waited += 10
                    operation = client.operations.get(operation)
                    print(f"[Veo] Generating... ({waited}s)")

                if not (operation.done and operation.response and operation.response.generated_videos):
                    return None

                veo_uri = operation.response.generated_videos[0].video.uri
                download_url = f"{veo_uri}&key={GOOGLE_AI_API_KEY}" if "?" in veo_uri else f"{veo_uri}?key={GOOGLE_AI_API_KEY}"
                resp = requests.get(download_url, timeout=120)
                resp.raise_for_status()
                video_bytes = resp.content
                print(f"[Veo] Downloaded {len(video_bytes):,} bytes.")

                r2_endpoint = os.getenv("R2_ENDPOINT_URL")
                r2_key_id   = os.getenv("R2_ACCESS_KEY_ID")
                r2_secret   = os.getenv("R2_SECRET_ACCESS_KEY")
                r2_bucket   = os.getenv("R2_BUCKET_NAME")
                r2_public   = os.getenv("R2_PUBLIC_URL", "").rstrip("/")

                if not all([r2_endpoint, r2_key_id, r2_secret, r2_bucket]):
                    return veo_uri

                s3 = boto3.client("s3", endpoint_url=r2_endpoint,
                                  aws_access_key_id=r2_key_id,
                                  aws_secret_access_key=r2_secret,
                                  region_name="auto")
                object_key = f"videos/reels/{uuid.uuid4().hex}.mp4"
                s3.put_object(Bucket=r2_bucket, Key=object_key,
                              Body=video_bytes, ContentType="video/mp4")
                print(f"[Veo] Uploaded to R2: {object_key}")
                return f"{r2_public}/{object_key}" if r2_public else f"{r2_endpoint.rstrip('/')}/{r2_bucket}/{object_key}"

            loop = asyncio.get_event_loop()
            video_url = await loop.run_in_executor(None, _generate_and_upload_sync)
            if video_url:
                return video_url

        except Exception as e:
            print(f"[Veo] Error: {e}")

    # ──────────────────────────────────────────────
    # Option 3: Sample video fallback
    # ──────────────────────────────────────────────
    print("[Video] No AI provider configured — using sample video.")
    await asyncio.sleep(3)
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"


