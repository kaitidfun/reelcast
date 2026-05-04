import os
from dotenv import load_dotenv

# Load env variables
load_dotenv(".env.local")
load_dotenv()

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "supersecret-session-key")

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

# Frontend URL
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
