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

import logging
from typing import Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

from app.core.config import (
    BACKEND_URL,
    FACEBOOK_SOCIAL_CLIENT_ID,
    FACEBOOK_SOCIAL_CLIENT_SECRET,
    INSTAGRAM_CLIENT_ID,
    INSTAGRAM_CLIENT_SECRET,
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
        # A single consent must cover both publishing from Distribute and
        # reading the member's videos through the tracking adapter.
        "scope": "user.info.basic,video.publish,video.list",
        "client_id_param": "client_key",
        "client_id": TIKTOK_CLIENT_KEY,
        "client_secret": TIKTOK_CLIENT_SECRET,
    },
    "facebook": {
        # This dedicated Meta app owns the Page permissions requested below;
        # it is separate from the app used for ordinary Sign in with Facebook.
        "authorize_url": "https://www.facebook.com/v21.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v21.0/oauth/access_token",
        # Pages that belong to a Meta Business Portfolio are not always
        # returned by /me/accounts, even for a user with Full control. The
        # Business Management scope permits the /me/assigned_pages fallback
        # below to resolve those Page assets.
        "scope": "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,business_management",
        "client_id_param": "client_id",
        "client_id": FACEBOOK_SOCIAL_CLIENT_ID,
        "client_secret": FACEBOOK_SOCIAL_CLIENT_SECRET,
    },
    "instagram": {
        # Instagram API with Instagram Login. Professional Instagram accounts
        # authorize ReelCast directly; this is not the Facebook Page flow.
        "authorize_url": "https://www.instagram.com/oauth/authorize",
        "token_url": "https://api.instagram.com/oauth/access_token",
        "scope": "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights",
        "client_id_param": "client_id",
        "client_id": INSTAGRAM_CLIENT_ID,
        "client_secret": INSTAGRAM_CLIENT_SECRET,
    },
    "youtube": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        # youtube.upload alone is not enough to call channels.list (used below
        # to resolve external_account_id) — Google returns 403 Forbidden
        # without youtube.readonly too.
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
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
    return bool(
        cfg["client_id"] and cfg["client_secret"]
    )


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
    if cfg.get("config_id"):
        params["config_id"] = cfg["config_id"]
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
    refresh_token = data.get("refresh_token")

    if platform == "instagram":
        # Instagram's initial token is short-lived (~1hr) and Meta doesn't
        # issue a separate refresh_token credential for it. Exchange
        # immediately for a long-lived one (~60 days) and store that same
        # value as this account's "refresh_token" too, so worker.py's
        # proactive-refresh block (gated on `if refresh_token:`) covers
        # Instagram as well — its self-refresh endpoint takes the current
        # long-lived access_token as input, which is exactly what gets
        # threaded through as refresh_token here.
        access_token = await _exchange_instagram_long_lived_token(access_token)
        refresh_token = access_token

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


async def _exchange_instagram_long_lived_token(short_lived_token: str) -> str:
    """~1hr short-lived token -> ~60-day long-lived token. Falls back to the
    short-lived token on failure rather than failing the whole connection —
    the account still works, just needs reconnecting sooner."""
    cfg = PLATFORM_CONFIGS["instagram"]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                "https://graph.instagram.com/access_token",
                params={
                    "grant_type": "ig_exchange_token",
                    "client_secret": cfg["client_secret"],
                    "access_token": short_lived_token,
                },
            )
        resp.raise_for_status()
        long_lived = resp.json().get("access_token")
        return long_lived or short_lived_token
    except httpx.HTTPError as exc:
        logger.warning("[OAuth] Could not exchange Instagram token for a long-lived one: %s", exc)
        return short_lived_token


async def refresh_access_token(platform: str, refresh_token: str) -> dict[str, Optional[str]]:
    """
    Exchange a stored refresh_token for a new access_token.

    Google and TikTok access tokens expire (~1 hour); a connected account
    is otherwise unusable for publishing past that window even though a
    valid refresh_token was saved at connect time and never used.

    Instagram has no separate refresh_token credential — its long-lived
    access_token refreshes itself via a dedicated endpoint (must be at
    least 24h old, not yet expired); `refresh_token` here is that same
    long-lived access_token (see exchange_code_for_token/
    _exchange_instagram_long_lived_token). Facebook long-lived tokens use
    yet another mechanism (fb_exchange_token) — not implemented since
    Facebook's proactive-refresh path isn't exercised yet (no refresh_token
    is ever stored for it); callers should treat a failure from this
    function as non-fatal and fall back to the existing access_token.

    Returns:
        {"access_token": str, "refresh_token": str | None} — refresh_token
        is only present when the provider issued a new one (Google
        normally keeps the original one valid instead of rotating it).

    Raises:
        OAuthProviderException: If the platform is unconfigured or the
            token endpoint rejects the refresh_token.
    """
    if platform == "instagram":
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    "https://graph.instagram.com/refresh_access_token",
                    params={"grant_type": "ig_refresh_token", "access_token": refresh_token},
                )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            raise OAuthProviderException("instagram rejected the token refresh") from exc
        access_token = data.get("access_token")
        if not access_token:
            raise OAuthProviderException("instagram did not return a refreshed access token")
        return {"access_token": access_token, "refresh_token": access_token}

    cfg = _get_config(platform)
    if not is_configured(platform):
        raise OAuthProviderException(
            f"{platform} is not configured yet — set its client id/secret in .env"
        )

    body = {
        cfg["client_id_param"]: cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                cfg["token_url"], data=body, headers={"Accept": "application/json"}
            )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise OAuthProviderException(f"{platform} rejected the token refresh") from exc

    access_token = data.get("access_token")
    if not access_token:
        raise OAuthProviderException(f"{platform} did not return a refreshed access token")

    return {
        "access_token": access_token,
        "refresh_token": data.get("refresh_token"),
    }


async def fetch_external_account_id(platform: str, access_token: str) -> Optional[str]:
    """
    Resolve the id to actually publish to — distinct from the OAuth user's
    own identity. Facebook/Instagram content publishes under a Page/IG
    Business account the user manages, not their personal profile; YouTube
    and TikTok need the channel/open_id. Best-effort: returns None (rather
    than raising) on any failure, since a missing id just means Step 4's
    publish task fails clearly later — it shouldn't block the connection
    itself from being saved.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if platform == "facebook":
                pages = await _list_facebook_pages(client, access_token)
                return pages[0]["id"] if pages else None

            if platform == "instagram":
                resp = await client.get(
                    "https://graph.instagram.com/v21.0/me",
                    params={"fields": "user_id", "access_token": access_token},
                )
                resp.raise_for_status()
                return resp.json().get("user_id")

            if platform == "youtube":
                resp = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "id", "mine": "true"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                items = resp.json().get("items", [])
                return items[0]["id"] if items else None

            if platform == "tiktok":
                resp = await client.get(
                    "https://open.tiktokapis.com/v2/user/info/",
                    params={"fields": "open_id"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                resp.raise_for_status()
                return resp.json().get("data", {}).get("user", {}).get("open_id")
    except httpx.HTTPError as exc:
        logger.warning(f"[OAuth] Could not resolve external_account_id for {platform}: {exc}")
        return None

    return None


async def _list_facebook_pages(client: httpx.AsyncClient, access_token: str) -> list[dict]:
    """Return publishable Pages, including Business Portfolio Page assets.

    Meta's normal /me/accounts edge only lists Pages directly managed by the
    user. A Page owned by a Business Portfolio can instead be exposed through
    /me/assigned_pages, despite the user having Full control in the Page UI.
    """
    resp = await client.get(
        "https://graph.facebook.com/v21.0/me/accounts",
        params={"fields": "id,name,access_token", "access_token": access_token},
    )
    resp.raise_for_status()
    pages = resp.json().get("data", [])
    if pages:
        return pages

    assigned_resp = await client.get(
        "https://graph.facebook.com/v21.0/me/assigned_pages",
        params={"fields": "id,name,access_token", "access_token": access_token},
    )
    assigned_resp.raise_for_status()
    return assigned_resp.json().get("data", [])


async def fetch_facebook_page_access_token(user_access_token: str, page_id: str) -> Optional[str]:
    """Resolve the Page token required to publish to a selected Facebook Page.

    The OAuth exchange returns a user token. Graph's /{page-id}/videos endpoint
    instead requires the Page access token returned by /me/accounts, so keeping
    the user token made an otherwise valid connection fail at publish time.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            pages = await _list_facebook_pages(client, user_access_token)
    except httpx.HTTPError as exc:
        logger.warning("[OAuth] Could not resolve Facebook Page access token: %s", exc)
        return None

    page = next((item for item in pages if str(item.get("id")) == str(page_id)), None)
    token = page.get("access_token") if page else None
    return token if isinstance(token, str) and token else None
