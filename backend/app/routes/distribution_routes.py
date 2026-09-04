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
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.exceptions import DistributionNotFoundException
from app.models.models import Campaign, Distribution, Product, Reel, SocialAccount, User
from app.schemas.distribution import (
    DistributionCreate,
    DistributionListResponse,
    DistributionReschedule,
    DistributionResponse,
    ReelDistributionGroup,
    ReelDistributionGroupList,
)
from app.services import distribution_service

router = APIRouter(prefix="/api/distributions", tags=["Distributions"])


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

    total = query.count()
    items = query.order_by(Distribution.created_at.desc()).offset(skip).limit(limit).all()
    _attach_display_fields(db, items)
    return DistributionListResponse(distributions=items, total=total)


@router.get("/by-reel", response_model=ReelDistributionGroupList)
def listDistributionsByReel(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    account_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The Distribute page's history, one row per Reel instead of one row per
    platform — a reel posted to 4 platforms is a single group with all 4
    inside it, so the list doesn't balloon with near-duplicate rows.

    `status_filter`/`account_id` narrow which reels qualify (a reel with at
    least one matching distribution), not which platforms are shown inside
    a matching reel's group — a reel matching "Failed" still shows its
    other, successful platforms for context. `search` matches the reel's
    name or prompt text.
    """
    matches = (
        db.query(
            Reel.reel_id,
            Reel.name,
            Reel.saved_prompt_text,
            func.max(Distribution.created_at).label("last_match_at"),
        )
        .join(Distribution, Distribution.reel_id == Reel.reel_id)
        .filter(Reel.user_id == current_user.user_id)
    )
    if search:
        like = f"%{search}%"
        matches = matches.filter(or_(Reel.name.ilike(like), Reel.saved_prompt_text.ilike(like)))
    if status_filter:
        matches = matches.filter(Distribution.status == status_filter)
    if account_id:
        matches = matches.filter(Distribution.account_id == account_id)
    matches = matches.group_by(Reel.reel_id, Reel.name, Reel.saved_prompt_text)

    total = matches.count()
    rows = matches.order_by(func.max(Distribution.created_at).desc()).offset(skip).limit(limit).all()
    reel_ids = [r.reel_id for r in rows]

    # Every platform for each matching reel, unfiltered — a status/platform
    # filter decides which reels show up, not which of their platforms do.
    all_items = (
        db.query(Distribution).filter(Distribution.reel_id.in_(reel_ids)).order_by(Distribution.created_at.desc()).all()
        if reel_ids else []
    )
    _attach_display_fields(db, all_items)
    by_reel: dict[UUID, list[Distribution]] = {}
    for item in all_items:
        by_reel.setdefault(item.reel_id, []).append(item)

    groups = [
        ReelDistributionGroup(
            reel_id=row.reel_id,
            reel_name=row.name,
            reel_prompt=row.saved_prompt_text,
            last_activity_at=max(
                (d.created_at for d in by_reel.get(row.reel_id, []) if d.created_at),
                default=row.last_match_at,
            ),
            platforms=by_reel.get(row.reel_id, []),
        )
        for row in rows
    ]
    return ReelDistributionGroupList(reels=groups, total=total)


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
