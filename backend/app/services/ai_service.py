import os
import asyncio
import json
import google.generativeai as genai
from typing import Dict, Any

# Configure Gemini with AI Studio Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

async def generate_captions(prompt: str, product_info: str, platform: str) -> Dict[str, Any]:
    """
    Generate optimized captions and hashtags using Google Gemini.
    """
    if not GEMINI_API_KEY:
        # Mock response if no key is provided
        await asyncio.sleep(2)
        return {
            "caption": f"Check out this amazing product! {prompt[:30]}... #mock #api",
            "hashtags": ["#mock", "#api", "#reelcast"]
        }
    
    model = genai.GenerativeModel('gemini-1.5-pro')
    
    system_prompt = f"""
    You are an expert social media marketer. Generate a caption and hashtags based on the user's prompt and product details.
    Target Platform: {platform}
    
    Rules:
    - If platform is Instagram (ig), the caption must be strictly under 1600 characters.
    - If platform is Facebook (fb), optimize for engagement and shareability.
    - Provide exactly 4 relevant hashtags.
    - Return the output in strict JSON format with keys: "caption" (string) and "hashtags" (list of strings).
    """
    
    user_content = f"User Prompt: {prompt}\nProduct Details: {product_info}"
    
    try:
        def _generate():
            response = model.generate_content(
                system_prompt + "\n\n" + user_content,
                generation_config={"response_mime_type": "application/json"}
            )
            return response.text
        
        loop = asyncio.get_event_loop()
        result_text = await loop.run_in_executor(None, _generate)
        return json.loads(result_text)
    except Exception as e:
        print(f"Error generating caption: {e}")
        # Fallback response
        return {
            "caption": f"Error generating caption: {str(e)}",
            "hashtags": ["#error"]
        }

async def generate_video(prompt: str, image_url: str = None) -> str:
    """
    Generate B-Roll video using Google Veo (Mock implementation for now).
    Requires Vertex AI setup for real Google Veo usage.
    """
    print(f"Simulating Google Veo video generation for prompt: {prompt}")
    await asyncio.sleep(8) # Simulate processing time
    
    # Return a dummy mock video URL
    # In production, this would upload to Cloudflare R2 and return the R2 URL
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
