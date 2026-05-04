from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth, OAuthError
from datetime import timedelta

from app.dependencies import get_db
from app.models.models import User
from app.services.auth_service import create_access_token
from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    FACEBOOK_CLIENT_ID,
    FACEBOOK_CLIENT_SECRET,
    FRONTEND_URL,
    BACKEND_URL,
)

router = APIRouter(prefix="/auth", tags=["OAuth"])

# OAuth Setup
oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

oauth.register(
    name="facebook",
    client_id=FACEBOOK_CLIENT_ID,
    client_secret=FACEBOOK_CLIENT_SECRET,
    api_base_url="https://graph.facebook.com/",
    access_token_url="https://graph.facebook.com/v13.0/oauth/access_token",
    authorize_url="https://www.facebook.com/v13.0/dialog/oauth",
    client_kwargs={"scope": "public_profile"},
)


@router.get("/{provider}/login")
async def login_via_social(provider: str, request: Request):
    redirect_uri = f"{BACKEND_URL}/auth/{provider}/callback"
    client = oauth.create_client(provider)
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def auth_callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
):
    client = oauth.create_client(provider)
    try:
        token = await client.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=OAuthError")

    if provider == "google":
        user_info = token.get("userinfo")
        if not user_info:
            user_info = await client.parse_id_token(request, token)
        email = user_info.get("email")
        display_name = user_info.get("name", "Google User")
    elif provider == "facebook":
        resp = await client.get("me?fields=id,name", token=token)
        user_info = resp.json()
        email = f"{user_info.get('id')}@facebook.com"
        display_name = user_info.get("name", "Facebook User")
    else:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=InvalidProvider")

    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=NoEmail")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, display_name=display_name, hashed_password=None)
        db.add(user)
        db.commit()
        db.refresh(user)

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return RedirectResponse(url=f"{FRONTEND_URL}/login?token={access_token}")
