"""
CRUD operations for Analytics.
"""

from uuid import UUID
from typing import Optional
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Analytics


def create_analytics(
    db: Session,
    *,
    distribution_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    source_platform: Optional[str] = None,
    views: int = 0,
    clicks: int = 0,
    orders: int = 0,
    revenue: float = 0,
    record_date: Optional[date] = None,
) -> Analytics:
    record = Analytics(
        distribution_id=distribution_id,
        product_id=product_id,
        source_platform=source_platform,
        views=views,
        clicks=clicks,
        orders=orders,
        revenue=revenue,
        record_date=record_date,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_analytics(db: Session, *, analytics_id: UUID) -> Optional[Analytics]:
    return (
        db.query(Analytics)
        .filter(Analytics.analytics_id == analytics_id)
        .first()
    )


def get_analytics_by_product(
    db: Session,
    *,
    product_id: UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Analytics], int]:
    base = db.query(Analytics).filter(Analytics.product_id == product_id)
    total = base.with_entities(func.count(Analytics.analytics_id)).scalar()
    items = (
        base.order_by(Analytics.record_date.desc().nullslast())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def get_analytics_by_distribution(
    db: Session,
    *,
    distribution_id: UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Analytics], int]:
    base = db.query(Analytics).filter(Analytics.distribution_id == distribution_id)
    total = base.with_entities(func.count(Analytics.analytics_id)).scalar()
    items = (
        base.order_by(Analytics.record_date.desc().nullslast())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def update_analytics(
    db: Session,
    *,
    record: Analytics,
    views: Optional[int] = None,
    clicks: Optional[int] = None,
    orders: Optional[int] = None,
    revenue: Optional[float] = None,
    source_platform: Optional[str] = None,
    record_date: Optional[date] = None,
) -> Analytics:
    if views is not None:
        record.views = views
    if clicks is not None:
        record.clicks = clicks
    if orders is not None:
        record.orders = orders
    if revenue is not None:
        record.revenue = revenue
    if source_platform is not None:
        record.source_platform = source_platform
    if record_date is not None:
        record.record_date = record_date
    db.commit()
    db.refresh(record)
    return record


def delete_analytics(db: Session, *, analytics_id: UUID) -> bool:
    record = (
        db.query(Analytics)
        .filter(Analytics.analytics_id == analytics_id)
        .first()
    )
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True


def get_product_analytics_summary(db: Session, *, product_id: UUID) -> dict:
    """Aggregate views, clicks, and orders for a product."""
    result = (
        db.query(
            func.coalesce(func.sum(Analytics.views), 0).label("total_views"),
            func.coalesce(func.sum(Analytics.clicks), 0).label("total_clicks"),
            func.coalesce(func.sum(Analytics.orders), 0).label("total_orders"),
            func.coalesce(func.sum(Analytics.revenue), 0).label("total_revenue"),
        )
        .filter(Analytics.product_id == product_id)
        .first()
    )
    return {
        "total_views": result.total_views,
        "total_clicks": result.total_clicks,
        "total_orders": result.total_orders,
        "total_revenue": float(result.total_revenue),
    }
