"""Library browsing endpoint described by F4-MD03."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import asc, desc
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.dependencies import get_current_user, get_db
from app.exceptions import DatabaseRetrieveException
from app.models.models import Campaign, Product, User
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
            campaign_query = campaign_query.filter(
                Campaign.name.ilike(f"%{searchKeyword.strip()}%")
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
