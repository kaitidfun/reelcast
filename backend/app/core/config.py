import os
from dotenv import load_dotenv

# Load env variables
load_dotenv(".env.local")
load_dotenv()

# Test execution
REELCAST_TEST_MODE = os.getenv("REELCAST_TEST_MODE", "false").lower() in {
    "1",
    "true",
    "yes",
}

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours — long enough for a full dev/demo session
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "supersecret-session-key")

# Encrypts SocialAccount.access_token / refresh_token at rest (Feature 3).
# Must be a urlsafe-base64-encoded 32-byte key — generate one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# The fallback below is a fixed dev-only key so local setup works with zero
# config; never rely on it outside a throwaway dev database.
TOKEN_ENCRYPTION_KEY = os.getenv(
    "TOKEN_ENCRYPTION_KEY", "JX4xHm2DITr8WXDbOxo6lAJ0fk7O4eU3_SY-pVEiQdk="
)

# Database
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:tonnoon2005@localhost:5432/reel_cast")

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

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

# Feature 3 — Multi-Platform Distribution: "connect account" OAuth apps.
# Empty until the real dev apps are registered (see project notes) — the
# connect flow will 500 with a clear provider error until these are set,
# rather than silently pretending to work.
TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "")
META_APP_ID = os.getenv("META_APP_ID", "")
META_APP_SECRET = os.getenv("META_APP_SECRET", "")
YOUTUBE_CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID", "")
YOUTUBE_CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET", "")

# Frontend URL
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")  # Optional: custom domain or public bucket URL
