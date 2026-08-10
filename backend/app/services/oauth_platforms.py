"""
Social Platform OAuth Configs (Feature 3 — Multi-Platform Distribution)
========================================================================
Builds the "connect account" authorize URL and exchanges the returned code
for tokens, for each platform Distribution supports.

Handwritten instead of using the Authlib client (already used for the F1
login flow in oauth_routes.py) because TikTok's OAuth2 deviates from the
standard — it uses `client_key` instead of `client_id` in the authorize
request — so every platform is treated uniformly here via a plain config
dict rather than special-casing one provider around a client built for the
other two.
"""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlencode

import httpx

from app.core.config import (
    BACKEND_URL,
    META_APP_ID,
    META_APP_SECRET,
    TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET,
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
)
from app.exceptions import OAuthProviderException

PLATFORM_CONFIGS: dict[str, dict] = {
    "tiktok": {
        "authorize_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        # video.publish covers Content Posting API uploads; user.info.basic
        # is needed to resolve the account's open_id for the Query Creator
        # Info step the Content Posting API requires before a direct post.
        "scope": "user.info.basic,video.publish",
        "client_id_param": "client_key",
        "client_id": TIKTOK_CLIENT_KEY,
        "client_secret": TIKTOK_CLIENT_SECRET,
    },
    "facebook": {
        "authorize_url": "https://www.facebook.com/v21.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v21.0/oauth/access_token",
        "scope": "pages_show_list,pages_read_engagement,pages_manage_posts",
        "client_id_param": "client_id",
        "client_id": META_APP_ID,
        "client_secret": META_APP_SECRET,
    },
    "instagram": {
        # Instagram Reels publishing rides on the same Meta app/Facebook Login
        # as the "facebook" platform above — Instagram Business accounts are
        # only reachable through the Facebook Page they're linked to.
        "authorize_url": "https://www.facebook.com/v21.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v21.0/oauth/access_token",
        "scope": "instagram_business_basic,instagram_business_content_publish,pages_show_list",
        "client_id_param": "client_id",
        "client_id": META_APP_ID,
        "client_secret": META_APP_SECRET,
    },
    "youtube": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "https://www.googleapis.com/auth/youtube.upload",
        "client_id_param": "client_id",
        "client_id": YOUTUBE_CLIENT_ID,
        "client_secret": YOUTUBE_CLIENT_SECRET,
        # offline + consent so Google actually returns a refresh_token —
        # without both, a re-connect of an already-authorized app silently
        # omits it.
        "extra_authorize_params": {"access_type": "offline", "prompt": "consent"},
    },
}


def _get_config(platform: str) -> dict:
    cfg = PLATFORM_CONFIGS.get(platform)
    if not cfg:
        raise OAuthProviderException(f"Unsupported platform: {platform}")
    return cfg


def is_configured(platform: str) -> bool:
    """True once real client credentials have been set for this platform."""
    cfg = _get_config(platform)
    return bool(cfg["client_id"] and cfg["client_secret"])


def build_redirect_uri(platform: str) -> str:
    return f"{BACKEND_URL}/api/social/{platform}/callback"


def build_authorize_url(platform: str, state: str) -> str:
    cfg = _get_config(platform)
    if not is_configured(platform):
        raise OAuthProviderException(
            f"{platform} is not configured yet — set its client id/secret in .env"
        )

    params = {
        cfg["client_id_param"]: cfg["client_id"],
        "redirect_uri": build_redirect_uri(platform),
        "scope": cfg["scope"],
        "response_type": "code",
        "state": state,
    }
    params.update(cfg.get("extra_authorize_params", {}))
    return f"{cfg['authorize_url']}?{urlencode(params)}"


async def exchange_code_for_token(platform: str, code: str) -> dict[str, Optional[str]]:
    """
    Exchange an authorization code for access/refresh tokens.

    Returns:
        {"access_token": str, "refresh_token": str | None}

    Raises:
        OAuthProviderException: If the platform is unconfigured or the token
            endpoint rejects the code.
    """
    cfg = _get_config(platform)
    if not is_configured(platform):
        raise OAuthProviderException(
            f"{platform} is not configured yet — set its client id/secret in .env"
        )

    body = {
        cfg["client_id_param"]: cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": build_redirect_uri(platform),
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                cfg["token_url"], data=body, headers={"Accept": "application/json"}
            )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise OAuthProviderException(f"{platform} rejected the connection") from exc

    access_token = data.get("access_token")
    if not access_token:
        raise OAuthProviderException(f"{platform} did not return an access token")

    return {
        "access_token": access_token,
        "refresh_token": data.get("refresh_token"),
    }
