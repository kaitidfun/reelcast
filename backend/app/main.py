from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import ALLOWED_ORIGINS, SESSION_SECRET_KEY
from app.database import engine, Base, SessionLocal
import app.models.models  # Import models so Base knows about them
from app.routes import auth_routes, twofa_routes, oauth_routes, upload_routes

# Create all database tables
Base.metadata.create_all(bind=engine)

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


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running and connected!"}
