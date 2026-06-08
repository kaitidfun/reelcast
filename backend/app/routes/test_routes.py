from fastapi import APIRouter, Depends
import os
import smtplib
import boto3
from sqlalchemy import text
from app.database import get_db
from sqlalchemy.orm import Session
import httpx

router = APIRouter(prefix="/test", tags=["Test Connections"])

@router.get("/connections")
async def test_connections(db: Session = Depends(get_db)):
    results = {}

    # 1. Local Database
    try:
        db.execute(text("SELECT 1"))
        results["database"] = {"status": "success", "message": "Connected"}
    except Exception as e:
        results["database"] = {"status": "error", "message": str(e)}

    # 2. SMTP
    try:
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", 587))
        server = smtplib.SMTP(smtp_server, smtp_port, timeout=5)
        server.starttls()
        server.quit()
        results["smtp"] = {"status": "success", "message": f"Connected to {smtp_server}:{smtp_port}"}
    except Exception as e:
        results["smtp"] = {"status": "error", "message": str(e)}

    # 3. Cloudflare R2
    try:
        r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        if r2_access_key and r2_endpoint and r2_endpoint != "https://<ACCOUNT_ID>.r2.cloudflarestorage.com":
            s3_client = boto3.client(
                's3',
                endpoint_url=r2_endpoint,
                aws_access_key_id=r2_access_key,
                aws_secret_access_key=r2_secret_key,
                region_name='auto'
            )
            s3_client.list_buckets()
            results["cloudflare_r2"] = {"status": "success", "message": "Connected and authenticated"}
        else:
            results["cloudflare_r2"] = {"status": "skipped", "message": "Credentials not fully configured"}
    except Exception as e:
        results["cloudflare_r2"] = {"status": "error", "message": str(e)}

    # 4. Google AI Studio (Gemini)
    try:
        api_key = os.getenv("GOOGLE_AI_API_KEY")
        if api_key and api_key != "your_google_ai_api_key":
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
                    json={"contents": [{"parts":[{"text": "hi"}]}]},
                    timeout=5
                )
                if response.status_code == 200:
                    results["google_ai"] = {"status": "success", "message": "Connected and authenticated"}
                else:
                    results["google_ai"] = {"status": "error", "message": f"HTTP {response.status_code}: {response.text}"}
        else:
            results["google_ai"] = {"status": "skipped", "message": "API key not configured"}
    except Exception as e:
        results["google_ai"] = {"status": "error", "message": str(e)}

    # 5. fal.ai
    try:
        fal_key = os.getenv("FAL_KEY")
        if fal_key and fal_key != "your_fal_api_key":
            # Just check if key is present for now, fal.ai requires authentication for their specific models
            # Hitting a simple endpoint to verify:
            async with httpx.AsyncClient() as client:
                # Use a dummy request to fal.ai to see if we get an auth error or something else
                response = await client.get(
                    "https://fal.run/fal-ai/fast-svd", 
                    headers={"Authorization": f"Key {fal_key}"},
                    timeout=5
                )
                # 405 Method Not Allowed or 400 Bad Request usually means auth succeeded but request was wrong
                # 401 Unauthorized means bad key
                if response.status_code != 401:
                    results["fal_ai"] = {"status": "success", "message": "Key is configured and authenticated"}
                else:
                    results["fal_ai"] = {"status": "error", "message": "Invalid API Key (HTTP 401)"}
        else:
            results["fal_ai"] = {"status": "skipped", "message": "API key not configured"}
    except Exception as e:
        results["fal_ai"] = {"status": "error", "message": str(e)}

    # 6. Google OAuth
    google_client_id = os.getenv("GOOGLE_CLIENT_ID")
    if google_client_id and google_client_id != "your_google_client_id.apps.googleusercontent.com":
        results["google_oauth"] = {"status": "success", "message": "Client ID configured"}
    else:
        results["google_oauth"] = {"status": "skipped", "message": "Client ID not configured"}

    # 7. Facebook OAuth
    facebook_client_id = os.getenv("FACEBOOK_CLIENT_ID")
    if facebook_client_id and facebook_client_id != "your_facebook_app_id":
        results["facebook_oauth"] = {"status": "success", "message": "Client ID configured"}
    else:
        results["facebook_oauth"] = {"status": "skipped", "message": "Client ID not configured"}

    return {"connections": results}
