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
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.core import config
from app.models.models import Distribution, Reel, SocialAccount
from app.services import oauth_platforms, social_account_service, tracking_service

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderConfig:
    url: str
    adapter_key: str


_PROVIDERS: dict[str, ProviderConfig] = {
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


async def _request_adapter(
    *, platform: str, account_id: str, external_account_id: str, access_token: str,
    post_ids: list[str] | None = None
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
        "post_ids": post_ids or [],
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
    social_account_id: UUID | None = None,
) -> int:
    distribution_links: dict[str, tuple[UUID, UUID | None]] = {}
    if social_account_id:
        # Native social APIs return a post id, not our distribution UUID.
        # Match that id to the one saved when the Reel was published so data
        # from every connected platform contributes to the Reel/product views.
        published = (
            db.query(
                Distribution.distribution_id,
                Distribution.platform_post_id,
                Reel.product_id,
            )
            .join(Reel, Distribution.reel_id == Reel.reel_id)
            .filter(
                Distribution.account_id == social_account_id,
                Distribution.status == "Published",
                Distribution.platform_post_id.is_not(None),
                Reel.user_id == user_id,
            )
            .all()
        )
        distribution_links = {
            f"{platform}:{row.platform_post_id}": (row.distribution_id, row.product_id)
            for row in published
        }

    metrics = await _request_adapter(
        platform=platform, account_id=account_id, external_account_id=external_account_id,
        access_token=access_token,
        post_ids=[key.removeprefix(platform + ':') for key in distribution_links],
    )
    observed_at = datetime.now(timezone.utc)
    for metric in metrics:
        if not isinstance(metric, dict) or not metric.get('external_ref'):
            raise TrackingProviderError('Adapter returned an invalid post reference')
        tracking_service.record_metric(
            db, user_id=user_id, social_account_id=social_account_id,
            source_platform=platform, external_ref=str(metric['external_ref']),
            record_date=date.fromisoformat(metric['record_date']) if metric.get('record_date') else None,
            observed_at=observed_at,
            **{name: metric.get(name) for name in tracking_service.SOCIAL_METRICS},
        )
    return len(metrics)


async def sync_social_account(db: Session, account: SocialAccount) -> int:
    try:
        refresh_token = social_account_service.get_decrypted_refresh_token(account)
        if refresh_token and account.platform_name in {'youtube', 'tiktok'}:
            refreshed = await oauth_platforms.refresh_access_token(account.platform_name, refresh_token)
            social_account_service.update_social_account_tokens(
                db, account=account, access_token=refreshed['access_token'],
                refresh_token=refreshed.get('refresh_token') or refresh_token)
        count = await _sync_metrics(
            db,
            user_id=account.user_id,
            platform=account.platform_name,
            account_id=str(account.account_id),
            external_account_id=account.external_account_id or "",
            access_token=social_account_service.get_decrypted_access_token(account),
            social_account_id=account.account_id,
        )
        account.last_synced_at = datetime.now(timezone.utc)
        account.sync_error = None
        db.commit()
        return count
    except Exception as exc:
        db.rollback()
        account.sync_error = 'Social sync failed; check provider permissions, credentials and adapter availability.'
        db.commit()
        logger.warning("[Tracking] %s social sync failed (%s)", account.platform_name, type(exc).__name__)
        return 0


async def sync_member(db: Session, *, user_id: UUID) -> dict:
    social = db.query(SocialAccount).filter(SocialAccount.user_id == user_id).all()
    results = []
    for account in social:
        if account.platform_name not in tracking_service.SUPPORTED_TRACKING_PLATFORMS:
            continue
        count = await sync_social_account(db, account)
        results.append(dict(account_id=str(account.account_id), platform=account.platform_name,
                            metrics=count, success=account.sync_error is None, error=account.sync_error))
    return {'social_metrics': sum(row['metrics'] for row in results), 'accounts': results}


async def sync_all_members(db: Session) -> dict:
    user_ids = [row[0] for row in db.query(SocialAccount.user_id).distinct().all()]
    total = {'members': 0, 'social_metrics': 0}
    for user_id in user_ids:
        result = await sync_member(db, user_id=user_id)
        total['members'] += 1
        total['social_metrics'] += result['social_metrics']
    return total
