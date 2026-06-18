from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import ALLOWED_ORIGINS, SESSION_SECRET_KEY
from app.exceptions import (
    InvalidEmailFormatException,
    InvalidPromptLengthException,
    ReelCastException,
)
from sqlalchemy import text as sa_text
from app.database import engine, Base, SessionLocal
import app.models.models  # Import models so Base knows about them
from app.routes import (
    auth_routes,
    campaign_routes,
    library_routes,
    oauth_routes,
    product_routes,
    reel_routes,
    test_routes,
    twofa_routes,
    upload_routes,
)

# Create all database tables (no-op for existing tables — safe on every restart)
Base.metadata.create_all(bind=engine)

# Safe incremental migrations — ADD COLUMN IF NOT EXISTS is idempotent on PostgreSQL.
# These run on every startup and are skipped automatically if the column already exists.
with engine.connect() as _conn:
    _conn.execute(sa_text(
        "ALTER TABLE reels ADD COLUMN IF NOT EXISTS raw_video_url TEXT"
    ))
    _conn.execute(sa_text(
        "ALTER TABLE reels ADD COLUMN IF NOT EXISTS first_frame_url VARCHAR"
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


@app.exception_handler(ReelCastException)
async def handle_reelcast_exception(
    _request: Request,
    exc: ReelCastException,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc), "exception": type(exc).__name__},
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    for error in exc.errors():
        field_path = {str(part) for part in error.get("loc", ())}
        if "email" in field_path:
            invalid_email = InvalidEmailFormatException()
            return JSONResponse(
                status_code=invalid_email.status_code,
                content={
                    "detail": str(invalid_email),
                    "exception": type(invalid_email).__name__,
                },
            )
        if "prompt_text" in field_path and error.get("type") == "string_too_long":
            invalid_prompt = InvalidPromptLengthException(
                "Prompt exceeds 500 characters"
            )
            return JSONResponse(
                status_code=invalid_prompt.status_code,
                content={
                    "detail": str(invalid_prompt),
                    "exception": type(invalid_prompt).__name__,
                },
            )

    return JSONResponse(status_code=422, content={"detail": exc.errors()})

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
app.include_router(library_routes.router)
app.include_router(reel_routes.router)
app.include_router(test_routes.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running and connected!"}
