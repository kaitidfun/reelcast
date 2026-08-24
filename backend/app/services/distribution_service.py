"""
CRUD operations for Distributions.
"""

from uuid import UUID
from typing import Optional
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Distribution


def create_distribution(
    db: Session,
    *,
    reel_id: UUID,
    account_id: UUID,
    scheduled_time: Optional[datetime] = None,
) -> Distribution:
    distribution = Distribution(
        reel_id=reel_id,
        account_id=account_id,
        scheduled_time=scheduled_time,
    )
    db.add(distribution)
    db.commit()
    db.refresh(distribution)
    return distribution


def get_distribution(db: Session, *, distribution_id: UUID) -> Optional[Distribution]:
    return (
        db.query(Distribution)
        .filter(Distribution.distribution_id == distribution_id)
        .first()
    )


def get_distributions(
    db: Session,
    *,
    reel_id: Optional[UUID] = None,
    account_id: Optional[UUID] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Distribution], int]:
    base = db.query(Distribution)
    if reel_id:
        base = base.filter(Distribution.reel_id == reel_id)
    if account_id:
        base = base.filter(Distribution.account_id == account_id)
    if status:
        base = base.filter(Distribution.status == status)

    total = base.with_entities(func.count(Distribution.distribution_id)).scalar()
    items = (
        base.order_by(Distribution.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def update_distribution(
    db: Session,
    *,
    distribution: Distribution,
    scheduled_time: Optional[datetime] = None,
    status: Optional[str] = None,
    error_message: Optional[str] = None,
    platform_post_id: Optional[str] = None,
) -> Distribution:
    if scheduled_time is not None:
        distribution.scheduled_time = scheduled_time
    if status is not None:
        distribution.status = status
    if error_message is not None:
        distribution.error_message = error_message
    if platform_post_id is not None:
        distribution.platform_post_id = platform_post_id
    db.commit()
    db.refresh(distribution)
    return distribution


def claim_distribution_for_publish(
    db: Session,
    *,
    distribution_id: UUID,
    allowed_statuses: tuple[str, ...],
) -> bool:
    """Atomically reserve a distribution before it is queued for publishing.

    Both the Publish now endpoint and Celery Beat use this conditional update.
    Only one caller can change an eligible Pending/Failed row to Uploading,
    preventing duplicate tasks when requests or scheduler ticks overlap.
    """
    claimed = (
        db.query(Distribution)
        .filter(
            Distribution.distribution_id == distribution_id,
            Distribution.status.in_(allowed_statuses),
        )
        .update(
            {
                Distribution.status: "Uploading",
                Distribution.error_message: None,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return claimed == 1


def increment_retry(db: Session, *, distribution: Distribution) -> Distribution:
    distribution.retry_count = (distribution.retry_count or 0) + 1
    db.commit()
    db.refresh(distribution)
    return distribution


def delete_distribution(db: Session, *, distribution_id: UUID) -> bool:
    dist = (
        db.query(Distribution)
        .filter(Distribution.distribution_id == distribution_id)
        .first()
    )
    if not dist:
        return False
    db.delete(dist)
    db.commit()
    return True
