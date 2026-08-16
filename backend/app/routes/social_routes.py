"""
Social Account connect/disconnect endpoints (Feature 3 — Multi-Platform
Distribution).
"""

from __future__ import annotations

import secrets
import urllib.parse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import ALGORITHM, FRONTEND_URL, SECRET_KEY
from app.dependencies import get_current_user, get_db
from app.exceptions import OAuthProviderException
from app.models.models import User
from app.schemas.social import SocialAccountListResponse
from app.services import social_account_service
from app.services.oauth_platforms import (
    PLATFORM_CONFIGS,
    build_authorize_url,
    exchange_code_for_token,
    fetch_external_account_id,
)

router = APIRouter(prefix="/api/social", tags=["Social Accounts"])

# Keys stashed in the signed session cookie (Starlette SessionMiddleware,
# already installed in main.py) between /connect and /callback — carries
# who initiated the flow and a CSRF nonce, since the callback is a raw
# browser redirect from the platform and can't carry our Authorization header.
_SESSION_USER_KEY = "reelcast_connect_user_id"
_SESSION_STATE_KEY = "reelcast_connect_state"
_SESSION_PLATFORM_KEY = "reelcast_connect_platform"


def _error_redirect(message: str) -> RedirectResponse:
    return RedirectResponse(url=f"{FRONTEND_URL}/distribute?error={urllib.parse.quote(message)}")


@router.get("/{platform}/connect")
def connectSocialAccount(platform: str, request: Request, token: str, db: Session = Depends(get_db)):
    """
    Start the OAuth connect flow for a platform.

    The frontend triggers this with a full-page navigation
    (window.location.href), not fetch() — the browser has to actually land
    on the platform's consent screen, so the usual Authorization header
    isn't available here. The caller's JWT is passed as a query param and
    decoded manually instead of via the normal get_current_user dependency.
    """
    if platform not in PLATFORM_CONFIGS:
        raise OAuthProviderException(f"Unsupported platform: {platform}")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
    except JWTError as exc:
        raise OAuthProviderException("Invalid or expired session") from exc

    user = db.query(User).filter(User.email == email).first() if email else None
    if not user:
        raise OAuthProviderException("Invalid or expired session")

    state = secrets.token_urlsafe(16)
    request.session[_SESSION_USER_KEY] = str(user.user_id)
    request.session[_SESSION_STATE_KEY] = state
    request.session[_SESSION_PLATFORM_KEY] = platform

    try:
        return RedirectResponse(url=build_authorize_url(platform, state))
    except OAuthProviderException as exc:
        # This is an expected Feature 3 error, not a failed ReelCast login.
        # Return to the Distribution page so its error toast can explain how
        # to proceed (for example, by configuring the platform credentials).
        request.session.pop(_SESSION_USER_KEY, None)
        request.session.pop(_SESSION_STATE_KEY, None)
        request.session.pop(_SESSION_PLATFORM_KEY, None)
        return _error_redirect(str(exc))


@router.get("/{platform}/callback")
async def socialAccountCallback(
    platform: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        return _error_redirect(f"{platform} authorization was cancelled or denied")

    expected_state = request.session.pop(_SESSION_STATE_KEY, None)
    expected_platform = request.session.pop(_SESSION_PLATFORM_KEY, None)
    user_id = request.session.pop(_SESSION_USER_KEY, None)

    if not user_id or not code or not state or state != expected_state or platform != expected_platform:
        return _error_redirect("Connection session expired — please try connecting again")

    try:
        tokens = await exchange_code_for_token(platform, code)
    except OAuthProviderException as exc:
        return _error_redirect(str(exc))

    external_account_id = await fetch_external_account_id(platform, tokens["access_token"])
    if not external_account_id:
        # A successful OAuth token exchange alone is not enough to publish.
        # Do not show this account as Connected until the platform-specific
        # Page, Business account, channel, or open_id has been resolved.
        return _error_redirect(
            f"Could not complete {platform} connection: target account could not be resolved"
        )

    existing = social_account_service.get_social_account_by_platform(
        db, user_id=UUID(user_id), platform_name=platform
    )
    if existing:
        social_account_service.update_social_account_tokens(
            db,
            account=existing,
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            external_account_id=external_account_id,
        )
    else:
        social_account_service.create_social_account(
            db,
            user_id=UUID(user_id),
            platform_name=platform,
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            external_account_id=external_account_id,
        )

    return RedirectResponse(url=f"{FRONTEND_URL}/distribute?connected={platform}")


@router.get("/accounts", response_model=SocialAccountListResponse)
def list_social_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accounts = social_account_service.get_social_accounts_by_user(db, user_id=current_user.user_id)
    return SocialAccountListResponse(accounts=accounts, total=len(accounts))


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnectSocialAccount(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = social_account_service.delete_social_account(
        db, account_id=account_id, user_id=current_user.user_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Social account not found")
