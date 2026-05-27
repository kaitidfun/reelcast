from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import ALLOWED_ORIGINS, SESSION_SECRET_KEY
from sqlalchemy import text as sa_text
from app.database import engine, Base, SessionLocal
import app.models.models  # Import models so Base knows about them
from app.routes import auth_routes, twofa_routes, oauth_routes, upload_routes, product_routes, campaign_routes, reel_routes

# Create all database tables (no-op for existing tables — safe on every restart)
Base.metadata.create_all(bind=engine)

# Safe incremental migrations — ADD COLUMN IF NOT EXISTS is idempotent on PostgreSQL.
# These run on every startup and are skipped automatically if the column already exists.
with engine.connect() as _conn:
    _conn.execute(sa_text(
        "ALTER TABLE reels ADD COLUMN IF NOT EXISTS raw_video_url TEXT"
    ))
    _conn.commit()

def get_db():
    """Dependency to yield database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# App setup
app = FastAPI(title="ReelCast Auth API")

# Middleware
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_routes.router)
app.include_router(twofa_routes.router)
app.include_router(oauth_routes.router)
app.include_router(upload_routes.router)
app.include_router(campaign_routes.router)
app.include_router(product_routes.router)
app.include_router(reel_routes.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running and connected!"}
