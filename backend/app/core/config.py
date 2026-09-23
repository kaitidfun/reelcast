import os
from pathlib import Path

from dotenv import load_dotenv

# Load env variables
PROJECT_ROOT = Path(__file__).resolve().parents[2]
# Local project configuration must win over variables inherited by an old
# development shell; otherwise an empty inherited value leaves OAuth disabled.
load_dotenv(PROJECT_ROOT / ".env", override=True)
load_dotenv(PROJECT_ROOT / ".env.local", override=True)

# Test execution
REELCAST_TEST_MODE = os.getenv("REELCAST_TEST_MODE", "false").lower() in {
    "1",
    "true",
    "yes",
}

# Security
# These fallbacks only apply when SECRET_KEY / SESSION_SECRET_KEY aren't set
# in .env — set them locally (never commit real values) before running
# anything that matters. The placeholders below are intentionally inert.
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_INSECURE_DEFAULT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours — long enough for a full dev/demo session
SESSION_SECRET_KEY = os.getenv(
    "SESSION_SECRET_KEY", "CHANGE_ME_INSECURE_DEFAULT_SESSION_KEY"
)

# Encrypts SocialAccount.access_token / refresh_token at rest (Feature 3).
# Must be a urlsafe-base64-encoded 32-byte key — generate one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# The fallback below is a placeholder key kept only so Fernet() doesn't crash
# with no .env present; it decrypts nothing real. Set TOKEN_ENCRYPTION_KEY in
# .env before connecting any real social account.
TOKEN_ENCRYPTION_KEY = os.getenv(
    "TOKEN_ENCRYPTION_KEY", "XiRi0FD2w5mQfEHM9UIzM1l3hnJNKtRnajMxe4EuUGg="
)

# Database — set DATABASE_URL in .env; the fallback below is a placeholder,
# not a real credential, and will fail to connect until overridden.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:CHANGE_ME@localhost:5432/reel_cast")

# CORS
# Keep the local defaults, while allowing a public frontend (staging or an
# ngrok tunnel) to be added without editing source code. Values are comma
# separated to match standard .env conventions.
_DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)
_configured_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = tuple(
    origin.strip() for origin in _configured_origins.split(",") if origin.strip()
) or _DEFAULT_ALLOWED_ORIGINS

# Email / SMTP
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

# OAuth Providers
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "dummy-client-id")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "dummy-client-secret")
FACEBOOK_CLIENT_ID = os.getenv("FACEBOOK_CLIENT_ID", "dummy-client-id")
FACEBOOK_CLIENT_SECRET = os.getenv("FACEBOOK_CLIENT_SECRET", "dummy-client-secret")
# Social Page publishing and insights are intentionally a separate Meta app
# from ordinary "Sign in with Facebook".
FACEBOOK_SOCIAL_CLIENT_ID = os.getenv("FACEBOOK_SOCIAL_CLIENT_ID", "")
FACEBOOK_SOCIAL_CLIENT_SECRET = os.getenv("FACEBOOK_SOCIAL_CLIENT_SECRET", "")

# Feature 3 — Multi-Platform Distribution: "connect account" OAuth apps.
# Empty until the real dev apps are registered (see project notes) — the
# connect flow will 500 with a clear provider error until these are set,
# rather than silently pretending to work.
TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "")
# TikTok verifies this public text file before enabling Content Posting API
# in Sandbox. Both values are supplied by TikTok Developer Portal and are
# intentionally separate from the OAuth client credentials above.
TIKTOK_URL_VERIFICATION_FILENAME = os.getenv("TIKTOK_URL_VERIFICATION_FILENAME", "")
TIKTOK_URL_VERIFICATION_CONTENT = os.getenv("TIKTOK_URL_VERIFICATION_CONTENT", "")
# Facebook distribution uses FACEBOOK_SOCIAL_* above, rather than the F1
# "Sign in with Facebook" application credentials.
# Instagram is a separate Meta app (Instagram Business login isn't available
# under the same app as Facebook Login in this account's setup).
INSTAGRAM_CLIENT_ID = os.getenv("INSTAGRAM_CLIENT_ID", "")
INSTAGRAM_CLIENT_SECRET = os.getenv("INSTAGRAM_CLIENT_SECRET", "")
YOUTUBE_CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID", "")
YOUTUBE_CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET", "")

# Frontend URL
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Feature 5 - Data Tracking connectors
#
# TikTok Shop credentials issued in Partner Center. These are kept separate
# from the ReelCast-to-adapter credentials below and must remain server-side.
TIKTOK_SHOP_APP_KEY = os.getenv("TIKTOK_SHOP_APP_KEY", "")
TIKTOK_SHOP_APP_SECRET = os.getenv("TIKTOK_SHOP_APP_SECRET", "")
SHOPEE_APP_KEY = os.getenv("SHOPEE_APP_KEY", "")
SHOPEE_APP_SECRET = os.getenv("SHOPEE_APP_SECRET", "")
LAZADA_APP_KEY = os.getenv("LAZADA_APP_KEY", "")
LAZADA_APP_SECRET = os.getenv("LAZADA_APP_SECRET", "")

# These URLs point to a small provider adapter (or API gateway) that converts a
# shop/social platform response into ReelCast's normalized metric contract.
# They deliberately remain empty until the corresponding app/API credentials
# and permissions have been approved by the provider.
TRACKING_SYNC_TIMEOUT_SECONDS = int(os.getenv("TRACKING_SYNC_TIMEOUT_SECONDS", "30"))
TRACKING_TIKTOK_SHOP_SYNC_URL = os.getenv("TRACKING_TIKTOK_SHOP_SYNC_URL", "")
TRACKING_SHOPEE_SYNC_URL = os.getenv("TRACKING_SHOPEE_SYNC_URL", "")
TRACKING_LAZADA_SYNC_URL = os.getenv("TRACKING_LAZADA_SYNC_URL", "")
TRACKING_TIKTOK_SYNC_URL = os.getenv("TRACKING_TIKTOK_SYNC_URL", "")
TRACKING_YOUTUBE_SYNC_URL = os.getenv("TRACKING_YOUTUBE_SYNC_URL", "")
TRACKING_FACEBOOK_SYNC_URL = os.getenv("TRACKING_FACEBOOK_SYNC_URL", "")
TRACKING_INSTAGRAM_SYNC_URL = os.getenv("TRACKING_INSTAGRAM_SYNC_URL", "")

# OAuth is delegated to the matching adapter because the three shop providers
# use different signing rules. AUTHORIZE_URL may contain {state} and
# {redirect_uri}; TOKEN_EXCHANGE_URL returns a normalized token payload.
TRACKING_TIKTOK_SHOP_AUTHORIZE_URL = os.getenv("TRACKING_TIKTOK_SHOP_AUTHORIZE_URL", "")
TRACKING_TIKTOK_SHOP_TOKEN_EXCHANGE_URL = os.getenv("TRACKING_TIKTOK_SHOP_TOKEN_EXCHANGE_URL", "")
TRACKING_SHOPEE_AUTHORIZE_URL = os.getenv("TRACKING_SHOPEE_AUTHORIZE_URL", "")
TRACKING_SHOPEE_TOKEN_EXCHANGE_URL = os.getenv("TRACKING_SHOPEE_TOKEN_EXCHANGE_URL", "")
TRACKING_LAZADA_AUTHORIZE_URL = os.getenv("TRACKING_LAZADA_AUTHORIZE_URL", "")
TRACKING_LAZADA_TOKEN_EXCHANGE_URL = os.getenv("TRACKING_LAZADA_TOKEN_EXCHANGE_URL", "")

# Optional key used to authenticate ReelCast to each adapter. The account's
# provider OAuth token is passed server-to-server only, never to the browser.
TRACKING_TIKTOK_SHOP_ADAPTER_KEY = os.getenv("TRACKING_TIKTOK_SHOP_ADAPTER_KEY", "")
TRACKING_SHOPEE_ADAPTER_KEY = os.getenv("TRACKING_SHOPEE_ADAPTER_KEY", "")
TRACKING_LAZADA_ADAPTER_KEY = os.getenv("TRACKING_LAZADA_ADAPTER_KEY", "")
TRACKING_TIKTOK_ADAPTER_KEY = os.getenv("TRACKING_TIKTOK_ADAPTER_KEY", "")
TRACKING_YOUTUBE_ADAPTER_KEY = os.getenv("TRACKING_YOUTUBE_ADAPTER_KEY", "")
TRACKING_FACEBOOK_ADAPTER_KEY = os.getenv("TRACKING_FACEBOOK_ADAPTER_KEY", "")
TRACKING_INSTAGRAM_ADAPTER_KEY = os.getenv("TRACKING_INSTAGRAM_ADAPTER_KEY", "")

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")  # Optional: custom domain or public bucket URL
