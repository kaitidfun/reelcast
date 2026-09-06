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
    fetch_facebook_page_access_token,
    is_configured,
)

router = APIRouter(prefix="/api/social", tags=["Social Accounts"])

# Keys stashed in the signed session cookie (Starlette SessionMiddleware,
# already installed in main.py) between /connect and /callback — carries
# who initiated the flow and a CSRF nonce, since the callback is a raw
# browser redirect from the platform and can't carry our Authorization header.
_SESSION_USER_KEY = "reelcast_connect_user_id"
_SESSION_STATE_KEY = "reelcast_connect_state"
_SESSION_PLATFORM_KEY = "reelcast_connect_platform"
_SESSION_RETURN_TO_KEY = "reelcast_connect_return_to"

_DEFAULT_RETURN_TO = "/account"


def _safe_return_to(value: str | None) -> str:
    """
    Only ever redirect back to a same-origin relative path — `value` rides
    through an unauthenticated query param and session cookie, so treat it
    as untrusted input rather than a trustworthy internal redirect target.
    """
    if value and value.startswith("/") and not value.startswith("//") and "://" not in value:
        return value
    return _DEFAULT_RETURN_TO


def _append_query(path: str, key: str, value: str) -> str:
    # `path` (return_to) may itself already carry a query string (e.g.
    # /create/publish?reelId=...), so a literal "?" would silently produce
    # a malformed URL for any caller other than the plain /account default.
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}{key}={urllib.parse.quote(value)}"


def _error_redirect(message: str, return_to: str = _DEFAULT_RETURN_TO) -> RedirectResponse:
    return RedirectResponse(
        url=f"{FRONTEND_URL}{_append_query(_safe_return_to(return_to), 'error', message)}"
    )


@router.get("/readiness")
def social_platform_readiness(
    current_user: User = Depends(get_current_user),
):
    """Return configuration state only; client ids, URLs and secrets stay server-side."""
    del current_user
    return {"platforms": {platform: is_configured(platform) for platform in PLATFORM_CONFIGS}}


@router.get("/{platform}/connect")
def connectSocialAccount(
    platform: str,
    request: Request,
    token: str,
    return_to: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Start the OAuth connect flow for a platform.

    The frontend triggers this with a full-page navigation
    (window.location.href), not fetch() — the browser has to actually land
    on the platform's consent screen, so the usual Authorization header
    isn't available here. The caller's JWT is passed as a query param and
    decoded manually instead of via the normal get_current_user dependency.

    `return_to` lets a caller other than the Settings page (e.g. the Publish
    page's "connect this platform" prompt) land back where it started once
    the OAuth round-trip finishes, instead of always landing on /account.
    """
    if platform not in PLATFORM_CONFIGS:
        raise OAuthProviderException(f"Unsupported platform: {platform}")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") not in (None, "access"):
            raise OAuthProviderException("Invalid or expired session")
        email = payload.get("sub")
    except JWTError as exc:
        raise OAuthProviderException("Invalid or expired session") from exc

    user = db.query(User).filter(User.email == email).first() if email else None
    if not user:
        raise OAuthProviderException("Invalid or expired session")

    state = secrets.token_urlsafe(16)
    safe_return_to = _safe_return_to(return_to)
    request.session[_SESSION_USER_KEY] = str(user.user_id)
    request.session[_SESSION_STATE_KEY] = state
    request.session[_SESSION_PLATFORM_KEY] = platform
    request.session[_SESSION_RETURN_TO_KEY] = safe_return_to

    try:
        return RedirectResponse(url=build_authorize_url(platform, state))
    except OAuthProviderException as exc:
        # This is an expected Feature 3 error, not a failed ReelCast login.
        # Return to wherever the connect attempt started so its error toast
        # can explain how to proceed (for example, configuring credentials).
        request.session.pop(_SESSION_USER_KEY, None)
        request.session.pop(_SESSION_STATE_KEY, None)
        request.session.pop(_SESSION_PLATFORM_KEY, None)
        request.session.pop(_SESSION_RETURN_TO_KEY, None)
        return _error_redirect(str(exc), safe_return_to)


@router.get("/{platform}/callback")
async def socialAccountCallback(
    platform: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    return_to = _safe_return_to(request.session.pop(_SESSION_RETURN_TO_KEY, None))

    if error:
        return _error_redirect(f"{platform} authorization was cancelled or denied", return_to)

    expected_state = request.session.pop(_SESSION_STATE_KEY, None)
    expected_platform = request.session.pop(_SESSION_PLATFORM_KEY, None)
    user_id = request.session.pop(_SESSION_USER_KEY, None)

    if not user_id or not code or not state or state != expected_state or platform != expected_platform:
        return _error_redirect("Connection session expired — please try connecting again", return_to)

    try:
        tokens = await exchange_code_for_token(platform, code)
    except OAuthProviderException as exc:
        return _error_redirect(str(exc), return_to)

    external_account_id = await fetch_external_account_id(platform, tokens["access_token"])
    if not external_account_id:
        # A successful OAuth token exchange alone is not enough to publish.
        # Do not show this account as Connected until the platform-specific
        # Page, Business account, channel, or open_id has been resolved.
        return _error_redirect(
            f"Could not complete {platform} connection: target account could not be resolved",
            return_to,
        )

    # Facebook's OAuth exchange returns a user token, while publishing to a
    # Page requires the Page token from /me/accounts. Store that Page token so
    # the distribution worker sends the credential Graph actually expects.
    publish_access_token = tokens["access_token"]
    if platform == "facebook":
        page_access_token = await fetch_facebook_page_access_token(
            tokens["access_token"], external_account_id
        )
        if not page_access_token:
            return _error_redirect(
                "Could not complete Facebook connection: no publish permission for the selected Page",
                return_to,
            )
        publish_access_token = page_access_token

    existing = social_account_service.get_social_account_by_platform(
        db, user_id=UUID(user_id), platform_name=platform
    )
    if existing:
        social_account_service.update_social_account_tokens(
            db,
            account=existing,
            access_token=publish_access_token,
            refresh_token=tokens.get("refresh_token"),
            external_account_id=external_account_id,
        )
    else:
        social_account_service.create_social_account(
            db,
            user_id=UUID(user_id),
            platform_name=platform,
            access_token=publish_access_token,
            refresh_token=tokens.get("refresh_token"),
            external_account_id=external_account_id,
        )

    return RedirectResponse(url=f"{FRONTEND_URL}{_append_query(return_to, 'connected', platform)}")


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
