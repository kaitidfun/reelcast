from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth, OAuthError
from datetime import timedelta
from urllib.parse import urlencode

from app.dependencies import get_db
from app.exceptions import OAuthProviderException
from app.models.models import User
from app.schemas.user import MAX_DISPLAY_NAME_LENGTH
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
async def authenticateMemberWithOAuth(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
):
    client = oauth.create_client(provider)
    if client is None:
        raise OAuthProviderException(f"Unsupported OAuth provider: {provider}")
    try:
        token = await client.authorize_access_token(request)
    except OAuthError as exc:
        raise OAuthProviderException() from exc

    if provider == "google":
        user_info = token.get("userinfo")
        if not user_info:
            user_info = await client.parse_id_token(request, token)
        email = user_info.get("email")
        display_name = str(user_info.get("name") or "Google User").strip()
        display_name = display_name[:MAX_DISPLAY_NAME_LENGTH] or "Google User"
    elif provider == "facebook":
        resp = await client.get("me?fields=id,name", token=token)
        user_info = resp.json()
        email = f"{user_info.get('id')}@facebook.com"
        display_name = str(user_info.get("name") or "Facebook User").strip()
        display_name = display_name[:MAX_DISPLAY_NAME_LENGTH] or "Facebook User"
    else:
        raise OAuthProviderException(f"Unsupported OAuth provider: {provider}")

    if not email:
        raise OAuthProviderException("OAuth provider did not return an email address")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, display_name=display_name, hashed_password=None)
        db.add(user)
        db.commit()
        db.refresh(user)

    if user.is_2fa_enabled:
        temp_token = create_access_token(
            data={"sub": user.email, "type": "2fa_challenge"},
            expires_delta=timedelta(minutes=5),
        )
        # The fragment stays in the browser and is consumed by the login page.
        challenge = urlencode({"requires_2fa": "1", "temp_token": temp_token})
        return RedirectResponse(
            url=f"{FRONTEND_URL}/login#{challenge}",
            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
        )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return RedirectResponse(url=f"{FRONTEND_URL}/login?token={access_token}")
