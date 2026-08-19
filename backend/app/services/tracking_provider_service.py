"""Server-side connector runner for Feature 5 data sources.

Platform APIs have different authentication/signature rules.  ReelCast calls a
per-platform adapter URL so that provider-specific signing stays isolated and
the dashboard always receives one normalized payload.  This module never logs
access or refresh tokens and never exposes them to the frontend.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote, urlencode
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.core import config
from app.models.models import EcommerceAccount, SocialAccount
from app.services import social_account_service, tracking_service
from app.services.crypto_service import decrypt_token

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderConfig:
    url: str
    adapter_key: str
    authorize_url: str = ""
    token_exchange_url: str = ""


_PROVIDERS: dict[str, ProviderConfig] = {
    "tiktok_shop": ProviderConfig(config.TRACKING_TIKTOK_SHOP_SYNC_URL, config.TRACKING_TIKTOK_SHOP_ADAPTER_KEY, config.TRACKING_TIKTOK_SHOP_AUTHORIZE_URL, config.TRACKING_TIKTOK_SHOP_TOKEN_EXCHANGE_URL),
    "shopee": ProviderConfig(config.TRACKING_SHOPEE_SYNC_URL, config.TRACKING_SHOPEE_ADAPTER_KEY, config.TRACKING_SHOPEE_AUTHORIZE_URL, config.TRACKING_SHOPEE_TOKEN_EXCHANGE_URL),
    "lazada": ProviderConfig(config.TRACKING_LAZADA_SYNC_URL, config.TRACKING_LAZADA_ADAPTER_KEY, config.TRACKING_LAZADA_AUTHORIZE_URL, config.TRACKING_LAZADA_TOKEN_EXCHANGE_URL),
    "tiktok": ProviderConfig(config.TRACKING_TIKTOK_SYNC_URL, config.TRACKING_TIKTOK_ADAPTER_KEY),
    "youtube": ProviderConfig(config.TRACKING_YOUTUBE_SYNC_URL, config.TRACKING_YOUTUBE_ADAPTER_KEY),
    "facebook": ProviderConfig(config.TRACKING_FACEBOOK_SYNC_URL, config.TRACKING_FACEBOOK_ADAPTER_KEY),
    "instagram": ProviderConfig(config.TRACKING_INSTAGRAM_SYNC_URL, config.TRACKING_INSTAGRAM_ADAPTER_KEY),
}


class TrackingProviderError(RuntimeError):
    pass


def readiness() -> dict[str, bool]:
    """Safe-to-return readiness map; secrets and URLs are intentionally omitted."""
    return {platform: bool(provider.url) for platform, provider in _PROVIDERS.items()}


def oauth_readiness() -> dict[str, bool]:
    """Whether each e-commerce platform can start and finish OAuth safely."""
    return {
        platform: bool(_PROVIDERS[platform].authorize_url and _PROVIDERS[platform].token_exchange_url)
        for platform in ("tiktok_shop", "shopee", "lazada")
    }


def build_authorize_url(platform: str, *, state: str, redirect_uri: str) -> str:
    provider = _PROVIDERS.get(platform)
    if not provider or not provider.authorize_url:
        raise TrackingProviderError(f"{platform} OAuth is not configured")

    # Adapters may require pre-signed vendor URLs. They can use explicit
    # placeholders; otherwise standard OAuth parameters are appended.
    if "{state}" in provider.authorize_url or "{redirect_uri}" in provider.authorize_url:
        return provider.authorize_url.replace("{state}", quote(state, safe="")).replace(
            "{redirect_uri}", quote(redirect_uri, safe=""),
        )
    separator = "&" if "?" in provider.authorize_url else "?"
    return f"{provider.authorize_url}{separator}{urlencode({'state': state, 'redirect_uri': redirect_uri})}"


async def exchange_authorization_code(
    platform: str, *, code: str, state: str, redirect_uri: str,
) -> dict[str, str | None]:
    provider = _PROVIDERS.get(platform)
    if not provider or not provider.token_exchange_url:
        raise TrackingProviderError(f"{platform} OAuth is not configured")
    headers = {"Accept": "application/json"}
    if provider.adapter_key:
        headers["X-ReelCast-Adapter-Key"] = provider.adapter_key
    try:
        async with httpx.AsyncClient(timeout=config.TRACKING_SYNC_TIMEOUT_SECONDS) as client:
            response = await client.post(
                provider.token_exchange_url,
                json={"platform": platform, "code": code, "state": state, "redirect_uri": redirect_uri},
                headers=headers,
            )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise TrackingProviderError(f"{platform} authorization exchange failed") from exc

    if not isinstance(payload, dict) or not payload.get("access_token") or not payload.get("external_shop_id"):
        raise TrackingProviderError("Adapter response must include access_token and external_shop_id")
    return {
        "access_token": str(payload["access_token"]),
        "refresh_token": str(payload["refresh_token"]) if payload.get("refresh_token") else None,
        "external_shop_id": str(payload["external_shop_id"]),
        "shop_name": str(payload["shop_name"]) if payload.get("shop_name") else None,
    }


def _metric_payload(metric: dict[str, Any], source_platform: str) -> dict[str, Any]:
    try:
        raw_date = metric.get("record_date")
        record_date = date.fromisoformat(raw_date) if isinstance(raw_date, str) else date.today()
        return {
            "source_platform": source_platform,
            "external_ref": str(metric["external_ref"]) if metric.get("external_ref") else None,
            "product_id": UUID(str(metric["product_id"])) if metric.get("product_id") else None,
            "distribution_id": UUID(str(metric["distribution_id"])) if metric.get("distribution_id") else None,
            "record_date": record_date,
            "views": int(metric.get("views", 0)),
            "clicks": int(metric.get("clicks", 0)),
            "orders": int(metric.get("orders", 0)),
            "engagement": int(metric.get("engagement", 0)),
            "revenue": float(metric.get("revenue", 0)),
        }
    except (TypeError, ValueError, KeyError) as exc:
        raise TrackingProviderError("Adapter returned an invalid metric") from exc


async def _request_adapter(
    *, platform: str, account_id: str, external_account_id: str, access_token: str,
) -> list[dict[str, Any]]:
    provider = _PROVIDERS.get(platform)
    if not provider or not provider.url:
        raise TrackingProviderError(f"{platform} tracking adapter is not configured")

    headers = {"Accept": "application/json"}
    if provider.adapter_key:
        headers["X-ReelCast-Adapter-Key"] = provider.adapter_key

    # The last 30 days gives a newly connected account usable history. The
    # adapter must return stable external_ref values, making later runs safe.
    payload = {
        "platform": platform,
        "account_id": account_id,
        "external_account_id": external_account_id,
        "access_token": access_token,
        "from_date": (date.today() - timedelta(days=30)).isoformat(),
        "to_date": date.today().isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=config.TRACKING_SYNC_TIMEOUT_SECONDS) as client:
            response = await client.post(provider.url, json=payload, headers=headers)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise TrackingProviderError(f"{platform} tracking adapter request failed") from exc

    metrics = body.get("metrics") if isinstance(body, dict) else None
    if not isinstance(metrics, list):
        raise TrackingProviderError("Adapter response must contain a metrics array")
    return metrics


async def _sync_metrics(
    db: Session,
    *,
    user_id: UUID,
    platform: str,
    account_id: str,
    external_account_id: str,
    access_token: str,
) -> int:
    metrics = await _request_adapter(
        platform=platform,
        account_id=account_id,
        external_account_id=external_account_id,
        access_token=access_token,
    )
    for metric in metrics:
        tracking_service.record_metric(
            db, user_id=user_id, **_metric_payload(metric, platform),
        )
    return len(metrics)


async def sync_ecommerce_account(db: Session, account: EcommerceAccount) -> int:
    try:
        count = await _sync_metrics(
            db,
            user_id=account.user_id,
            platform=account.platform_name,
            account_id=str(account.ecommerce_account_id),
            external_account_id=account.external_shop_id,
            access_token=decrypt_token(account.access_token),
        )
    except Exception as exc:
        account.sync_error = str(exc)
        db.commit()
        logger.warning("[Tracking] %s shop sync failed: %s", account.platform_name, exc)
        return 0

    account.last_synced_at = datetime.now(timezone.utc)
    account.sync_error = None
    db.commit()
    return count


async def sync_social_account(db: Session, account: SocialAccount) -> int:
    try:
        return await _sync_metrics(
            db,
            user_id=account.user_id,
            platform=account.platform_name,
            account_id=str(account.account_id),
            external_account_id=account.external_account_id or "",
            access_token=social_account_service.get_decrypted_access_token(account),
        )
    except Exception as exc:
        # SocialAccount has no status columns. Avoid persisting tokens/errors;
        # its metrics simply remain at their last successful values.
        logger.warning("[Tracking] %s social sync failed: %s", account.platform_name, exc)
        return 0


async def sync_member(db: Session, *, user_id: UUID) -> dict[str, int]:
    ecommerce = db.query(EcommerceAccount).filter(EcommerceAccount.user_id == user_id).all()
    social = db.query(SocialAccount).filter(SocialAccount.user_id == user_id).all()
    ecommerce_count = sum([await sync_ecommerce_account(db, account) for account in ecommerce])
    social_count = sum([await sync_social_account(db, account) for account in social])
    return {"ecommerce_metrics": ecommerce_count, "social_metrics": social_count}


async def sync_all_members(db: Session) -> dict[str, int]:
    user_ids = {
        row[0] for row in db.query(EcommerceAccount.user_id).distinct().all()
    } | {
        row[0] for row in db.query(SocialAccount.user_id).distinct().all()
    }
    total = {"members": 0, "ecommerce_metrics": 0, "social_metrics": 0}
    for user_id in user_ids:
        result = await sync_member(db, user_id=user_id)
        total["members"] += 1
        total["ecommerce_metrics"] += result["ecommerce_metrics"]
        total["social_metrics"] += result["social_metrics"]
    return total
