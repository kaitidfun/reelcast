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
    Campaign,
    Distribution,
    EcommerceAccount,
    Product,
    Reel,
    SocialAccount,
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
    social_account_id: UUID | None = None,
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
    if social_account_id and not db.query(SocialAccount.account_id).filter(
        SocialAccount.account_id == social_account_id,
        SocialAccount.user_id == user_id,
    ).first():
        raise LookupError("Social account not found")

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
            existing.social_account_id = social_account_id
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
        social_account_id=social_account_id,
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
        .outerjoin(SocialAccount, Analytics.social_account_id == SocialAccount.account_id)
        .filter(or_(
            Product.user_id == user_id,
            Reel.user_id == user_id,
            SocialAccount.user_id == user_id,
        ))
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


def _metric_totals(query) -> dict:
    result = query.with_entities(
        func.coalesce(func.sum(Analytics.views), 0),
        func.coalesce(func.sum(Analytics.clicks), 0),
        func.coalesce(func.sum(Analytics.orders), 0),
        func.coalesce(func.sum(Analytics.engagement), 0),
        func.coalesce(func.sum(Analytics.revenue), 0),
    ).one()
    totals = {
        "views": int(result[0] or 0),
        "clicks": int(result[1] or 0),
        "orders": int(result[2] or 0),
        "engagement": int(result[3] or 0),
        "revenue": float(result[4] or 0),
    }
    totals["click_through_rate"] = round(
        totals["clicks"] / totals["views"] * 100, 2,
    ) if totals["views"] else 0.0
    return totals


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
    query = _apply_tracking_filters(_member_metrics_query(db, user_id), **filters)

    totals = _metric_totals(query)
    # A Reel can be sent to several platforms, so count distinct Reel ids.
    # Only a completed platform publish is a successful distribution.
    totals["reels"] = (
        db.query(func.count(func.distinct(Reel.reel_id)))
        .join(Distribution, Distribution.reel_id == Reel.reel_id)
        .filter(
            Reel.user_id == user_id,
            Reel.deleted_at.is_(None),
            Distribution.status == "Published",
        )
        .scalar()
        or 0
    )

    trend_rows = (
        query.with_entities(
            Analytics.record_date.label("date"),
            func.coalesce(func.sum(Analytics.views), 0).label("views"),
            func.coalesce(func.sum(Analytics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(Analytics.orders), 0).label("orders"),
            func.coalesce(func.sum(Analytics.engagement), 0).label("engagement"),
            func.coalesce(func.sum(Analytics.revenue), 0).label("revenue"),
        )
        .filter(Analytics.record_date.is_not(None))
        .group_by(Analytics.record_date)
        .order_by(Analytics.record_date)
        .all()
    )

    platform_rows = (
        query.with_entities(
            func.coalesce(Analytics.source_platform, "unknown").label("platform"),
            func.coalesce(func.sum(Analytics.views), 0).label("views"),
            func.coalesce(func.sum(Analytics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(Analytics.orders), 0).label("orders"),
            func.coalesce(func.sum(Analytics.engagement), 0).label("engagement"),
            func.coalesce(func.sum(Analytics.revenue), 0).label("revenue"),
        )
        .group_by(Analytics.source_platform)
        .order_by(func.sum(Analytics.views).desc())
        .all()
    )

    products = (
        db.query(
            Product.product_id.label("id"), Product.product_name.label("name"),
            func.coalesce(func.sum(Analytics.views), 0).label("views"),
            func.coalesce(func.sum(Analytics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(Analytics.orders), 0).label("orders"),
            func.coalesce(func.sum(Analytics.engagement), 0).label("engagement"),
            func.coalesce(func.sum(Analytics.revenue), 0).label("revenue"),
        )
        .join(Analytics, Analytics.product_id == Product.product_id)
        .filter(Product.user_id == user_id, Product.deleted_at.is_(None))
        .group_by(Product.product_id, Product.product_name)
        .order_by(func.sum(Analytics.orders).desc(), func.sum(Analytics.views).desc())
        .limit(5)
    )
    products = _apply_tracking_filters(products, **filters).all()

    campaigns = (
        db.query(
            Campaign.campaign_id.label("id"), Campaign.name.label("name"),
            func.coalesce(func.sum(Analytics.views), 0).label("views"),
            func.coalesce(func.sum(Analytics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(Analytics.orders), 0).label("orders"),
            func.coalesce(func.sum(Analytics.engagement), 0).label("engagement"),
            func.coalesce(func.sum(Analytics.revenue), 0).label("revenue"),
        )
        .join(Product, Product.campaign_id == Campaign.campaign_id)
        .join(Analytics, Analytics.product_id == Product.product_id)
        .filter(Campaign.user_id == user_id, Campaign.deleted_at.is_(None))
        .group_by(Campaign.campaign_id, Campaign.name)
        .order_by(func.sum(Analytics.orders).desc(), func.sum(Analytics.views).desc())
        .limit(5)
    )
    campaigns = _apply_tracking_filters(campaigns, **filters).all()

    reels = (
        db.query(
            Reel.reel_id.label("id"), Reel.prompt_text.label("name"),
            func.coalesce(func.sum(Analytics.views), 0).label("views"),
            func.coalesce(func.sum(Analytics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(Analytics.orders), 0).label("orders"),
            func.coalesce(func.sum(Analytics.engagement), 0).label("engagement"),
            func.coalesce(func.sum(Analytics.revenue), 0).label("revenue"),
        )
        .join(Distribution, Distribution.reel_id == Reel.reel_id)
        .join(Analytics, Analytics.distribution_id == Distribution.distribution_id)
        .outerjoin(Product, Product.product_id == Reel.product_id)
        .filter(Reel.user_id == user_id, Reel.deleted_at.is_(None))
        .group_by(Reel.reel_id, Reel.prompt_text)
        .order_by(func.sum(Analytics.orders).desc(), func.sum(Analytics.views).desc())
        .limit(5)
    )
    reels = _apply_tracking_filters(reels, **filters).all()

    def serialize(rows):
        return [
            {
                "id": str(row.id), "name": row.name, "views": int(row.views or 0),
                "clicks": int(row.clicks or 0), "orders": int(row.orders or 0),
                "engagement": int(row.engagement or 0), "revenue": float(row.revenue or 0),
                "click_through_rate": round(
                    int(row.clicks or 0) / int(row.views or 0) * 100, 2,
                ) if row.views else 0.0,
            }
            for row in rows
        ]

    latest_ecommerce_sync_at = (
        db.query(func.max(EcommerceAccount.last_synced_at))
        .filter(EcommerceAccount.user_id == user_id)
        .scalar()
    )
    latest_social_sync_at = (
        db.query(func.max(SocialAccount.last_synced_at))
        .filter(SocialAccount.user_id == user_id)
        .scalar()
    )
    latest_sync_at = max(
        (value for value in (latest_ecommerce_sync_at, latest_social_sync_at) if value is not None),
        default=None,
    )

    return {
        "totals": totals,
        "trend": [
            {"date": row.date.isoformat(), "views": int(row.views or 0), "clicks": int(row.clicks or 0), "orders": int(row.orders or 0), "engagement": int(row.engagement or 0), "revenue": float(row.revenue or 0)}
            for row in trend_rows
        ],
        "platforms": [
            {"platform": row.platform, "views": int(row.views or 0), "clicks": int(row.clicks or 0), "orders": int(row.orders or 0), "engagement": int(row.engagement or 0), "revenue": float(row.revenue or 0)}
            for row in platform_rows
        ],
        "products": serialize(products),
        "campaigns": serialize(campaigns),
        "reels": serialize(reels),
        "has_data": bool(trend_rows),
        "last_synced_at": latest_sync_at.isoformat() if latest_sync_at else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _analysis_metric_expression(metric: str):
    if metric == "ctr":
        return func.coalesce(
            func.sum(Analytics.clicks) * 100.0 / func.nullif(func.sum(Analytics.views), 0), 0,
        )
    return func.coalesce(func.sum(getattr(Analytics, metric)), 0)


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
    aggregate = _analysis_metric_expression(metric).label("value")
    columns = (
        func.coalesce(func.sum(Analytics.views), 0).label("views"),
        func.coalesce(func.sum(Analytics.clicks), 0).label("clicks"),
        func.coalesce(func.sum(Analytics.orders), 0).label("orders"),
        func.coalesce(func.sum(Analytics.engagement), 0).label("engagement"),
        func.coalesce(func.sum(Analytics.revenue), 0).label("revenue"),
        aggregate,
    )

    if level == "product":
        ranked = (
            db.query(Product.product_id.label("id"), Product.product_name.label("name"), *columns)
            .join(Analytics, Analytics.product_id == Product.product_id)
            .filter(Product.user_id == user_id, Product.deleted_at.is_(None))
            .group_by(Product.product_id, Product.product_name)
        )
    elif level == "campaign":
        ranked = (
            db.query(Campaign.campaign_id.label("id"), Campaign.name.label("name"), *columns)
            .join(Product, Product.campaign_id == Campaign.campaign_id)
            .join(Analytics, Analytics.product_id == Product.product_id)
            .filter(Campaign.user_id == user_id, Campaign.deleted_at.is_(None))
            .group_by(Campaign.campaign_id, Campaign.name)
        )
    elif level == "reel":
        ranked = (
            db.query(Reel.reel_id.label("id"), Reel.prompt_text.label("name"), *columns)
            .join(Distribution, Distribution.reel_id == Reel.reel_id)
            .join(Analytics, Analytics.distribution_id == Distribution.distribution_id)
            .outerjoin(Product, Product.product_id == Reel.product_id)
            .filter(Reel.user_id == user_id, Reel.deleted_at.is_(None))
            .group_by(Reel.reel_id, Reel.prompt_text)
        )
    else:
        ranked = (
            _member_metrics_query(db, user_id)
            .with_entities(
                func.coalesce(Analytics.source_platform, "unknown").label("id"),
                func.coalesce(Analytics.source_platform, "Unknown platform").label("name"),
                *columns,
            )
            .group_by(Analytics.source_platform)
        )

    ranked_rows = (
        _apply_tracking_filters(ranked, **filters)
        .order_by(aggregate.desc())
        .all()
    )
    trend_rows = (
        _apply_tracking_filters(_member_metrics_query(db, user_id), **filters)
        .with_entities(Analytics.record_date.label("date"), _analysis_metric_expression(metric).label("value"))
        .filter(Analytics.record_date.is_not(None))
        .group_by(Analytics.record_date)
        .order_by(Analytics.record_date)
        .all()
    )

    return {
        "level": level,
        "metric": metric,
        "rows": [
            {
                "id": str(row.id), "name": row.name, "value": float(row.value or 0),
                "views": int(row.views or 0), "clicks": int(row.clicks or 0),
                "orders": int(row.orders or 0), "engagement": int(row.engagement or 0),
                "revenue": float(row.revenue or 0),
                "click_through_rate": round(
                    int(row.clicks or 0) / int(row.views or 0) * 100, 2,
                ) if row.views else 0.0,
            }
            for row in ranked_rows
        ],
        "trend": [
            {"date": row.date.isoformat(), "value": float(row.value or 0)}
            for row in trend_rows
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
