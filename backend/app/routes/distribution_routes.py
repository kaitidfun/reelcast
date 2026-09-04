"""
Distribution endpoints (Feature 3 — Multi-Platform Distribution).

Distribution has no user_id column of its own — ownership is always
checked by joining through Reel.user_id, since every Distribution is tied
to exactly one Reel.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.exceptions import DistributionNotFoundException
from app.models.models import Campaign, Distribution, Product, Reel, SocialAccount, User
from app.schemas.distribution import (
    DistributionCreate,
    DistributionListResponse,
    DistributionReschedule,
    DistributionResponse,
)
from app.services import distribution_service

router = APIRouter(prefix="/api/distributions", tags=["Distributions"])

PLATFORM_SEARCH_LABELS = {
    "youtube": "YouTube Shorts",
    "tiktok": "TikTok",
    "facebook": "Facebook",
    "instagram": "Instagram",
}


def _attach_display_fields(db: Session, items: list[Distribution]) -> None:
    """
    Attach reel_prompt/platform_name to each Distribution in-place — two
    grouped lookups instead of N+1 queries, matching the pattern
    library_routes._attach_reel_counts() uses for the same reason.
    """
    if not items:
        return
    reel_ids = {d.reel_id for d in items if d.reel_id}
    account_ids = {d.account_id for d in items if d.account_id}

    # saved_prompt_text/name, not the live ones — a Distribution always
    # publishes the saved snapshot (see worker.py), so its display label
    # should match.
    reel_rows = (
        dict((r.reel_id, r) for r in db.query(Reel.reel_id, Reel.saved_prompt_text, Reel.name).filter(Reel.reel_id.in_(reel_ids)).all())
        if reel_ids else {}
    )
    platform_names = (
        dict(db.query(SocialAccount.account_id, SocialAccount.platform_name).filter(SocialAccount.account_id.in_(account_ids)).all())
        if account_ids else {}
    )
    for d in items:
        reel_row = reel_rows.get(d.reel_id)
        d.reel_prompt = reel_row.saved_prompt_text if reel_row else None
        d.reel_name = reel_row.name if reel_row else None
        d.platform_name = platform_names.get(d.account_id)


def _get_owned_distribution(db: Session, *, distribution_id: UUID, user_id: UUID) -> Distribution:
    distribution = (
        db.query(Distribution)
        .join(Reel, Distribution.reel_id == Reel.reel_id)
        .filter(Distribution.distribution_id == distribution_id, Reel.user_id == user_id)
        .first()
    )
    if not distribution:
        raise DistributionNotFoundException()
    return distribution


@router.post("", response_model=DistributionResponse, status_code=status.HTTP_201_CREATED)
def createDistribution(
    req: DistributionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Schedule (or queue for immediate) publishing of a Reel to a connected
    account. Without scheduled_time, Step 5's Celery Beat picks it up on its
    next tick; POST .../publish-now below skips waiting for that.
    """
    reel = (
        db.query(Reel)
        .filter(Reel.reel_id == req.reel_id, Reel.user_id == current_user.user_id)
        .first()
    )
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    if reel.status != "Completed":
        raise HTTPException(status_code=400, detail="Only a Completed reel can be distributed")
    if not reel.is_saved:
        raise HTTPException(status_code=400, detail="Save this reel before distributing it")

    account = (
        db.query(SocialAccount)
        .filter(SocialAccount.account_id == req.account_id, SocialAccount.user_id == current_user.user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Connected account not found")

    return distribution_service.create_distribution(
        db,
        reel_id=req.reel_id,
        account_id=req.account_id,
        scheduled_time=req.scheduled_time,
    )


@router.get("", response_model=DistributionListResponse)
def listDistributions(
    reel_id: Optional[UUID] = None,
    account_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Distribution).join(Reel, Distribution.reel_id == Reel.reel_id).filter(
        Reel.user_id == current_user.user_id
    )
    if reel_id:
        query = query.filter(Distribution.reel_id == reel_id)
    if account_id:
        query = query.filter(Distribution.account_id == account_id)
    if status_filter:
        query = query.filter(Distribution.status == status_filter)
    if search and (search_term := search.strip()):
        pattern = f"%{search_term}%"
        normalized_search = search_term.casefold()
        matching_platforms = [
            platform
            for platform, label in PLATFORM_SEARCH_LABELS.items()
            if normalized_search in label.casefold()
        ]
        search_conditions = [
            Reel.name.ilike(pattern),
            SocialAccount.platform_name.ilike(pattern),
            cast(Distribution.status, String).ilike(pattern),
        ]
        if matching_platforms:
            search_conditions.append(SocialAccount.platform_name.in_(matching_platforms))
        query = query.outerjoin(
            SocialAccount,
            Distribution.account_id == SocialAccount.account_id,
        ).filter(
            or_(*search_conditions)
        )

    matched_reel_ids = [
        row[0]
        for row in query.with_entities(Distribution.reel_id).distinct().all()
        if row[0] is not None
    ]
    matched_campaign_ids = [
        row[0]
        for row in query.join(Product, Reel.product_id == Product.product_id)
        .join(Campaign, Product.campaign_id == Campaign.campaign_id)
        .with_entities(Campaign.campaign_id)
        .distinct()
        .all()
        if row[0] is not None
    ]
    total = query.count()
    items = query.order_by(Distribution.created_at.desc()).offset(skip).limit(limit).all()
    _attach_display_fields(db, items)
    return DistributionListResponse(
        distributions=items,
        total=total,
        matched_reel_ids=matched_reel_ids,
        matched_campaign_ids=matched_campaign_ids,
    )


@router.get("/recent-campaigns")
def recentDistributedCampaigns(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Campaign ids ordered by their most recent distribution (through
    Campaign -> Product -> Reel -> Distribution), for the Distribute page's
    "Recently Distributed Campaigns" section. Id-only on purpose — the
    frontend already has a richer campaign-card fetch (GET /api/library);
    this just supplies the relevance order and which ids qualify.
    """
    rows = (
        db.query(Campaign.campaign_id, func.max(Distribution.created_at).label("last_dist"))
        .join(Product, Product.campaign_id == Campaign.campaign_id)
        .join(Reel, Reel.product_id == Product.product_id)
        .join(Distribution, Distribution.reel_id == Reel.reel_id)
        .filter(Campaign.user_id == current_user.user_id)
        .group_by(Campaign.campaign_id)
        .order_by(func.max(Distribution.created_at).desc())
        .limit(limit)
        .all()
    )
    return {"campaign_ids": [str(r.campaign_id) for r in rows]}


@router.get("/campaigns/{campaign_id}/products")
def recentDistributedProductsForCampaign(
    campaign_id: UUID,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Product ids within one campaign that have at least one distributed reel,
    ordered by most recent distribution — backs the campaign drill-down page.
    Id-only, same reasoning as recent-campaigns above.
    """
    rows = (
        db.query(Product.product_id, func.max(Distribution.created_at).label("last_dist"))
        .join(Reel, Reel.product_id == Product.product_id)
        .join(Distribution, Distribution.reel_id == Reel.reel_id)
        .filter(Product.campaign_id == campaign_id, Product.user_id == current_user.user_id)
        .group_by(Product.product_id)
        .order_by(func.max(Distribution.created_at).desc())
        .limit(limit)
        .all()
    )
    return {"product_ids": [str(r.product_id) for r in rows]}


@router.delete("/{distribution_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancelDistribution(
    distribution_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    distribution = _get_owned_distribution(db, distribution_id=distribution_id, user_id=current_user.user_id)
    if distribution.status == "Uploading":
        raise HTTPException(status_code=409, detail="Cannot cancel a distribution that's actively publishing")
    distribution_service.delete_distribution(db, distribution_id=distribution.distribution_id)


@router.patch("/{distribution_id}", response_model=DistributionResponse)
def rescheduleDistribution(
    distribution_id: UUID,
    req: DistributionReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change when a still-pending distribution goes out. Publish Now is the
    separate lever for "just do it immediately" — this only ever moves the
    scheduled time, never clears it."""
    distribution = _get_owned_distribution(db, distribution_id=distribution_id, user_id=current_user.user_id)
    if distribution.status not in ("Pending", "Failed"):
        raise HTTPException(status_code=409, detail=f"Cannot reschedule a distribution that's {distribution.status}")
    return distribution_service.update_distribution(db, distribution=distribution, scheduled_time=req.scheduled_time)


@router.post("/{distribution_id}/publish-now", response_model=DistributionResponse)
def publishNow(
    distribution_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Queue the Step 4 Celery task immediately, without waiting for Beat's next tick."""
    distribution = _get_owned_distribution(db, distribution_id=distribution_id, user_id=current_user.user_id)
    if distribution.status not in ("Pending", "Failed"):
        raise HTTPException(status_code=409, detail=f"Distribution is already {distribution.status}")

    # Claim in the database before queueing. The initial status check above is
    # useful for a clear error response, but only this conditional update is
    # safe when two publish-now requests arrive at the same time.
    if not distribution_service.claim_distribution_for_publish(
        db,
        distribution_id=distribution.distribution_id,
        allowed_statuses=("Pending", "Failed"),
    ):
        db.refresh(distribution)
        raise HTTPException(status_code=409, detail=f"Distribution is already {distribution.status}")

    db.refresh(distribution)

    from app.worker import publishDistribution  # local import — avoids a circular import with worker.py

    publishDistribution.delay(str(distribution.distribution_id))
    return distribution
