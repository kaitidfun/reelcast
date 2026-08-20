"""Library browsing endpoint described by F4-MD03."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, asc, desc, func, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.dependencies import get_current_user, get_db
from app.exceptions import DatabaseRetrieveException
from app.models.models import Campaign, Product, Reel, User
from app.schemas.campaign import CampaignResponse
from app.schemas.product import ProductResponse

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("")
def browseLibrary(
    searchKeyword: Optional[str] = Query(None, max_length=100),
    sortOption: Literal["Newest", "Oldest", "Last Updated", "Name"] = "Newest",
    viewMode: Literal["Grid", "List"] = "Grid",
    statusFilter: Optional[Literal["Active", "Draft"]] = None,
    campaignNameFilter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve and filter campaigns with their associated products."""
    del viewMode  # Display preference is applied by the frontend.

    try:
        campaign_query = db.query(Campaign).filter(
            Campaign.user_id == current_user.user_id,
            Campaign.deleted_at.is_(None),
        )
        if searchKeyword:
            search_pattern = f"%{searchKeyword.strip()}%"
            campaign_query = (
                campaign_query.outerjoin(
                    Product,
                    and_(
                        Product.campaign_id == Campaign.campaign_id,
                        Product.user_id == current_user.user_id,
                        Product.deleted_at.is_(None),
                    ),
                )
                .filter(
                    or_(
                        Campaign.name.ilike(search_pattern),
                        Campaign.description.ilike(search_pattern),
                        Product.product_name.ilike(search_pattern),
                    )
                )
                .distinct()
            )
        if campaignNameFilter:
            campaign_query = campaign_query.filter(
                Campaign.name == campaignNameFilter
            )

        if sortOption == "Oldest":
            campaign_query = campaign_query.order_by(asc(Campaign.created_at))
        elif sortOption == "Last Updated":
            campaign_query = campaign_query.order_by(desc(Campaign.updated_at))
        elif sortOption == "Name":
            campaign_query = campaign_query.order_by(asc(Campaign.name))
        else:
            campaign_query = campaign_query.order_by(desc(Campaign.created_at))

        campaigns = campaign_query.all()
        campaign_ids = [campaign.campaign_id for campaign in campaigns]

        if campaign_ids:
            products = (
                db.query(Product)
                .options(joinedload(Product.images))
                .filter(
                    Product.user_id == current_user.user_id,
                    Product.deleted_at.is_(None),
                    Product.campaign_id.in_(campaign_ids),
                )
                .all()
            )
        else:
            products = []
        if statusFilter:
            products = [
                product
                for product in products
                if _product_status(product) == statusFilter
            ]

        _attach_reel_counts(db, products, user_id=current_user.user_id)

        return {
            "campaigns": [
                CampaignResponse.model_validate(campaign)
                for campaign in campaigns
            ],
            "products": [
                ProductResponse.model_validate(product)
                for product in products
            ],
            "total": len(campaigns),
        }
    except SQLAlchemyError as exc:
        raise DatabaseRetrieveException() from exc


def _attach_reel_counts(db: Session, products: list[Product], *, user_id) -> None:
    """
    Attach a `reel_count` attribute to each Product ORM instance in-place.

    One grouped query for all products instead of a per-product COUNT, so
    browsing a library with many products doesn't turn into an N+1 query.
    ProductResponse.reel_count falls back to its default (0) for any product
    with no matching row in the count map.
    """
    product_ids = [p.product_id for p in products]
    if not product_ids:
        return

    counts = dict(
        db.query(Reel.product_id, func.count(Reel.reel_id))
        .filter(
            Reel.user_id == user_id,
            Reel.deleted_at.is_(None),
            Reel.is_saved.is_(True),
            Reel.product_id.in_(product_ids),
        )
        .group_by(Reel.product_id)
        .all()
    )
    for product in products:
        product.reel_count = counts.get(product.product_id, 0)


def _product_status(product: Product) -> str:
    is_complete = all(
        (
            bool(product.product_name and product.product_name.strip()),
            bool(product.description and product.description.strip()),
            bool(product.affiliate_link and product.affiliate_link.strip()),
            bool(product.images),
        )
    )
    return "Active" if is_complete else "Draft"
