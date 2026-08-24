"""Feature 5 persistence and aggregation helpers.

Provider-specific OAuth/API clients should normalize their responses into
``record_metric``.  Keeping the dashboard based on this internal shape means
TikTok Shop, Shopee, Lazada and the social platforms remain interchangeable.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.models import (
    Analytics,
    AttributionLink,
    Campaign,
    Distribution,
    EcommerceAccount,
    OutboundClick,
    Product,
    Reel,
    User,
)
from app.services.crypto_service import encrypt_token


SUPPORTED_TRACKING_PLATFORMS = frozenset({
    "tiktok_shop", "shopee", "lazada", "tiktok", "youtube", "facebook", "instagram",
})
ANALYSIS_LEVELS = frozenset({"product", "campaign", "reel", "platform"})
ANALYSIS_METRICS = frozenset({"views", "clicks", "orders", "engagement", "revenue", "ctr"})


def list_ecommerce_accounts(db: Session, *, user_id: UUID) -> list[EcommerceAccount]:
    return (
        db.query(EcommerceAccount)
        .filter(EcommerceAccount.user_id == user_id)
        .order_by(EcommerceAccount.created_at.desc())
        .all()
    )


def upsert_ecommerce_account(
    db: Session,
    *,
    user_id: UUID,
    platform_name: str,
    external_shop_id: str,
    access_token: str,
    refresh_token: str | None = None,
    shop_name: str | None = None,
) -> EcommerceAccount:
    account = (
        db.query(EcommerceAccount)
        .filter(
            EcommerceAccount.user_id == user_id,
            EcommerceAccount.platform_name == platform_name,
            EcommerceAccount.external_shop_id == external_shop_id,
        )
        .first()
    )
    if account:
        account.access_token = encrypt_token(access_token)
        account.refresh_token = encrypt_token(refresh_token) if refresh_token else None
        account.shop_name = shop_name or account.shop_name
        account.sync_error = None
    else:
        account = EcommerceAccount(
            user_id=user_id,
            platform_name=platform_name,
            external_shop_id=external_shop_id,
            shop_name=shop_name,
            access_token=encrypt_token(access_token),
            refresh_token=encrypt_token(refresh_token) if refresh_token else None,
        )
        db.add(account)
    db.commit()
    db.refresh(account)
    return account


def delete_ecommerce_account(db: Session, *, account_id: UUID, user_id: UUID) -> bool:
    account = (
        db.query(EcommerceAccount)
        .filter(EcommerceAccount.ecommerce_account_id == account_id, EcommerceAccount.user_id == user_id)
        .first()
    )
    if not account:
        return False
    db.delete(account)
    db.commit()
    return True


def record_metric(
    db: Session,
    *,
    user_id: UUID,
    source_platform: str,
    external_ref: str | None = None,
    record_date: date,
    product_id: UUID | None = None,
    distribution_id: UUID | None = None,
    views: int = 0,
    clicks: int = 0,
    orders: int = 0,
    engagement: int = 0,
    revenue: float = 0,
) -> Analytics:
    """Persist a provider metric only after checking Member ownership."""
    if product_id and not db.query(Product.product_id).filter(
        Product.product_id == product_id, Product.user_id == user_id
    ).first():
        raise LookupError("Product not found")
    if distribution_id and not (
        db.query(Distribution.distribution_id)
        .join(Reel, Distribution.reel_id == Reel.reel_id)
        .filter(Distribution.distribution_id == distribution_id, Reel.user_id == user_id)
        .first()
    ):
        raise LookupError("Distribution not found")

    if external_ref:
        existing = db.query(Analytics).filter(
            Analytics.source_platform == source_platform,
            Analytics.external_ref == external_ref,
        ).first()
        if existing:
            # A provider may return the same order/post on every polling run.
            # Update it rather than double-counting the dashboard totals.
            existing.product_id = product_id
            existing.distribution_id = distribution_id
            existing.record_date = record_date
            existing.views = max(0, views)
            existing.clicks = max(0, clicks)
            existing.orders = max(0, orders)
            existing.engagement = max(0, engagement)
            existing.revenue = Decimal(str(max(0, revenue)))
            db.commit()
            db.refresh(existing)
            return existing

    record = Analytics(
        product_id=product_id,
        distribution_id=distribution_id,
        source_platform=source_platform,
        external_ref=external_ref,
        record_date=record_date,
        views=max(0, views),
        clicks=max(0, clicks),
        orders=max(0, orders),
        engagement=max(0, engagement),
        revenue=Decimal(str(max(0, revenue))),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _member_metrics_query(db: Session, user_id: UUID):
    """Analytics rows reachable through a Member's product or distribution."""
    return (
        db.query(Analytics)
        .outerjoin(Product, Analytics.product_id == Product.product_id)
        .outerjoin(Distribution, Analytics.distribution_id == Distribution.distribution_id)
        .outerjoin(Reel, Distribution.reel_id == Reel.reel_id)
        .filter(or_(Product.user_id == user_id, Reel.user_id == user_id))
    )


def _apply_tracking_filters(
    query,
    *,
    start: date | None,
    end: date | None,
    platform: str | None = None,
    campaign_id: UUID | None = None,
    product_id: UUID | None = None,
):
    """Apply the SRS dashboard and analysis filters to a metrics query."""
    if start:
        query = query.filter(Analytics.record_date >= start)
    if end:
        query = query.filter(Analytics.record_date <= end)
    if platform:
        query = query.filter(Analytics.source_platform == platform)
    if campaign_id:
        query = query.filter(Product.campaign_id == campaign_id)
    if product_id:
        query = query.filter(Product.product_id == product_id)
    return query


def _empty_metrics() -> dict:
    return {"views": 0, "clicks": 0, "orders": 0, "engagement": 0, "revenue": 0.0}


def _add_metrics(target: dict, **values) -> None:
    """Add metrics without ever treating a provider's generic clicks as commerce clicks."""
    for field in ("views", "clicks", "orders", "engagement"):
        target[field] += int(values.get(field, 0) or 0)
    target["revenue"] += float(values.get("revenue", 0) or 0)


def _finalize_metrics(metrics: dict) -> dict:
    metrics = {**metrics, "revenue": round(float(metrics["revenue"]), 2)}
    metrics["click_through_rate"] = round(
        metrics["clicks"] / metrics["views"] * 100, 2,
    ) if metrics["views"] else 0.0
    return metrics


def _member_outbound_click_query(db: Session, user_id: UUID):
    """Clicks owned through an attribution link's Reel (never raw redirect traffic)."""
    return (
        db.query(OutboundClick, AttributionLink, Product, Reel)
        .join(AttributionLink, OutboundClick.attribution_link_id == AttributionLink.attribution_link_id)
        .join(Product, AttributionLink.product_id == Product.product_id)
        .join(Reel, AttributionLink.reel_id == Reel.reel_id)
        .filter(Reel.user_id == user_id, Reel.deleted_at.is_(None))
    )


def _apply_outbound_click_filters(
    query,
    *,
    start: date | None,
    end: date | None,
    platform: str | None = None,
    campaign_id: UUID | None = None,
    product_id: UUID | None = None,
):
    if start:
        query = query.filter(func.date(OutboundClick.clicked_at) >= start)
    if end:
        query = query.filter(func.date(OutboundClick.clicked_at) <= end)
    if platform:
        query = query.filter(AttributionLink.platform == platform)
    if campaign_id:
        query = query.filter(Product.campaign_id == campaign_id)
    if product_id:
        query = query.filter(Product.product_id == product_id)
    return query


def _analytics_context(metric: Analytics) -> tuple[Product | None, Reel | None]:
    """Find the Product/Reel that owns an already-authorized analytics record."""
    product = metric.product
    reel = metric.distribution.reel if metric.distribution else None
    if product is None and reel is not None:
        product = reel.product
    return product, reel


def _add_group(groups: dict, group: str, *, key, name: str, metrics: dict) -> None:
    if key is None:
        return
    bucket = groups[group].setdefault(str(key), {"id": str(key), "name": name, **_empty_metrics()})
    _add_metrics(bucket, **metrics)


def _build_tracking_breakdown(db: Session, *, user_id: UUID, filters: dict) -> dict:
    """Merge synchronized social/e-commerce metrics with ReelCast outbound clicks.

    ``Analytics.clicks`` is deliberately excluded.  It is a legacy, provider-
    specific field and cannot truthfully be shown as an Outbound Click.  The
    only source for that metric is the redirect's ``outbound_clicks`` table.
    """
    analytics_rows = _apply_tracking_filters(
        _member_metrics_query(db, user_id), **filters,
    ).all()
    click_rows = _apply_outbound_click_filters(
        _member_outbound_click_query(db, user_id), **filters,
    ).all()

    totals = _empty_metrics()
    by_date: dict[date, dict] = {}
    groups = {"platforms": {}, "products": {}, "campaigns": {}, "reels": {}}

    def record(*, record_date: date | None, platform_name: str | None,
               product: Product | None, reel: Reel | None, metrics: dict) -> None:
        _add_metrics(totals, **metrics)
        if record_date:
            _add_metrics(by_date.setdefault(record_date, _empty_metrics()), **metrics)
        _add_group(groups, "platforms", key=platform_name or "unknown",
                   name=platform_name or "Unknown platform", metrics=metrics)
        if product:
            _add_group(groups, "products", key=product.product_id,
                       name=product.product_name, metrics=metrics)
            if product.campaign:
                _add_group(groups, "campaigns", key=product.campaign.campaign_id,
                           name=product.campaign.name, metrics=metrics)
        if reel:
            _add_group(groups, "reels", key=reel.reel_id,
                       name=reel.prompt_text, metrics=metrics)

    for metric in analytics_rows:
        product, reel = _analytics_context(metric)
        record(
            record_date=metric.record_date,
            platform_name=metric.source_platform,
            product=product,
            reel=reel,
            # Views/engagement/orders/revenue are the synchronized provider
            # values.  Do not relabel provider clicks as redirect clicks.
            metrics={
                "views": metric.views, "engagement": metric.engagement,
                "orders": metric.orders, "revenue": metric.revenue,
            },
        )

    for click, link, product, reel in click_rows:
        record(
            record_date=click.clicked_at.date() if click.clicked_at else None,
            platform_name=link.platform,
            product=product,
            reel=reel,
            metrics={"clicks": 1},
        )

    def sorted_rows(group: str, *, limit: int | None = None) -> list[dict]:
        rows = [_finalize_metrics(row) for row in groups[group].values()]
        rows.sort(key=lambda row: (row["orders"], row["clicks"], row["views"]), reverse=True)
        return rows[:limit] if limit else rows

    return {
        "totals": _finalize_metrics(totals),
        "trend": [
            {"date": day.isoformat(), **_finalize_metrics(metrics)}
            for day, metrics in sorted(by_date.items())
        ],
        "platforms": sorted_rows("platforms"),
        "products": sorted_rows("products", limit=5),
        "campaigns": sorted_rows("campaigns", limit=5),
        "reels": sorted_rows("reels", limit=5),
    }


def dashboard(
    db: Session,
    *,
    user_id: UUID,
    start: date | None = None,
    end: date | None = None,
    platform: str | None = None,
    campaign_id: UUID | None = None,
    product_id: UUID | None = None,
) -> dict:
    filters = {
        "start": start, "end": end, "platform": platform,
        "campaign_id": campaign_id, "product_id": product_id,
    }
    breakdown = _build_tracking_breakdown(db, user_id=user_id, filters=filters)
    totals = breakdown["totals"]
    # This headline is specifically for successfully published destinations,
    # not every Reel the member has generated or saved in the library.
    totals["published_distributions"] = (
        db.query(func.count(Distribution.distribution_id))
        .join(Reel, Distribution.reel_id == Reel.reel_id)
        .filter(
            Reel.user_id == user_id,
            Reel.deleted_at.is_(None),
            Distribution.status == "Published",
        )
        .scalar()
        or 0
    )

    latest_sync_at = (
        db.query(func.max(EcommerceAccount.last_synced_at))
        .filter(EcommerceAccount.user_id == user_id)
        .scalar()
    )

    return {
        "totals": totals,
        "trend": breakdown["trend"],
        "platforms": [
            {"platform": row["name"], **{key: row[key] for key in _empty_metrics()}}
            for row in breakdown["platforms"]
        ],
        "products": breakdown["products"],
        "campaigns": breakdown["campaigns"],
        "reels": breakdown["reels"],
        "has_data": bool(breakdown["trend"]),
        "last_synced_at": latest_sync_at.isoformat() if latest_sync_at else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def analyze_performance(
    db: Session,
    *,
    user_id: UUID,
    level: str,
    metric: str,
    start: date | None = None,
    end: date | None = None,
    platform: str | None = None,
    campaign_id: UUID | None = None,
    product_id: UUID | None = None,
) -> dict:
    """Return the selected UC06 comparison, trend, and per-item detail fields."""
    filters = {
        "start": start, "end": end, "platform": platform,
        "campaign_id": campaign_id, "product_id": product_id,
    }
    breakdown = _build_tracking_breakdown(db, user_id=user_id, filters=filters)
    group_name = {"product": "products", "campaign": "campaigns", "reel": "reels", "platform": "platforms"}[level]
    ranked_rows = sorted(
        breakdown[group_name], key=lambda row: row["click_through_rate"] if metric == "ctr" else row[metric], reverse=True,
    )

    return {
        "level": level,
        "metric": metric,
        "rows": [
            {
                **row,
                "value": float(row["click_through_rate"] if metric == "ctr" else row[metric]),
            }
            for row in ranked_rows
        ],
        "trend": [
            {"date": row["date"], "value": float(row["click_through_rate"] if metric == "ctr" else row[metric])}
            for row in breakdown["trend"]
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def mark_accounts_synced(db: Session, *, user_id: UUID) -> int:
    """Mark active connections checked by the sync task.

    Provider SDK calls belong in adapters that call ``record_metric``.  This
    step is deliberately safe when no provider credentials are configured.
    """
    accounts = list_ecommerce_accounts(db, user_id=user_id)
    now = datetime.now(timezone.utc)
    for account in accounts:
        account.last_synced_at = now
        account.sync_error = None
    db.commit()
    return len(accounts)


def mark_all_accounts_synced(db: Session) -> int:
    account_ids = [row[0] for row in db.query(User.user_id).all()]
    return sum(mark_accounts_synced(db, user_id=user_id) for user_id in account_ids)
