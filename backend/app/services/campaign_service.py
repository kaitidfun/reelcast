"""
CRUD operations for Campaigns.
All queries are scoped to the authenticated user to enforce ownership.
"""

from uuid import UUID
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Campaign


def create_campaign(
    db: Session,
    *,
    user_id: UUID,
    name: str,
    description: Optional[str] = None,
) -> Campaign:
    campaign = Campaign(
        user_id=user_id,
        name=name,
        description=description,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


def get_campaign(db: Session, *, campaign_id: UUID, user_id: UUID) -> Optional[Campaign]:
    return (
        db.query(Campaign)
        .filter(
            Campaign.campaign_id == campaign_id,
            Campaign.user_id == user_id,
            Campaign.deleted_at.is_(None),
        )
        .first()
    )


def get_campaigns(
    db: Session,
    *,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Campaign], int]:
    base = db.query(Campaign).filter(
        Campaign.user_id == user_id,
        Campaign.deleted_at.is_(None),
    )
    total = base.with_entities(func.count(Campaign.campaign_id)).scalar()
    items = base.order_by(Campaign.created_at.desc()).offset(skip).limit(limit).all()
    return items, total


def update_campaign(
    db: Session,
    *,
    campaign: Campaign,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Campaign:
    if name is not None:
        campaign.name = name
    if description is not None:
        campaign.description = description
    db.commit()
    db.refresh(campaign)
    return campaign


def soft_delete_campaign(db: Session, *, campaign: Campaign) -> Campaign:
    campaign.deleted_at = func.now()
    db.commit()
    db.refresh(campaign)
    return campaign
