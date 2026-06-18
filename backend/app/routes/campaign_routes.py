from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID

from app.dependencies import get_db, get_current_user
from app.exceptions import (
    CampaignNotFoundException,
    DatabaseRetrieveException,
    DatabaseUpdateException,
)
from app.models.models import User, Campaign
from app.services import campaign_service
from app.schemas.campaign import (
    CampaignCreate,
    CampaignUpdate,
    CampaignResponse,
    CampaignListResponse,
)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def createCampaign(
    campaign_in: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new campaign (collection) for the authenticated user.
    """
    return campaign_service.createCampaign(
        db,
        userId=current_user.user_id,
        campaignName=campaign_in.name,
        description=campaign_in.description,
        bannerColor=campaign_in.banner_color,
        coverImage=(
            None
            if campaign_in.banner_image_url == ""
            else campaign_in.banner_image_url
        ),
    )


@router.get("", response_model=CampaignListResponse)
def browseCampaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    """
    List all campaigns for the authenticated user.
    """
    try:
        query = db.query(Campaign).filter(
            Campaign.user_id == current_user.user_id,
            Campaign.deleted_at.is_(None),
        )
        total = query.count()
        campaigns = query.offset(skip).limit(limit).all()
    except SQLAlchemyError as exc:
        raise DatabaseRetrieveException() from exc
    
    return {
        "campaigns": campaigns,
        "total": total
    }


@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific campaign by ID.
    """
    campaign = db.query(Campaign).filter(
        Campaign.campaign_id == campaign_id,
        Campaign.user_id == current_user.user_id
    ).first()
    
    if not campaign:
        raise CampaignNotFoundException()
        
    return campaign


@router.put("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: UUID,
    campaign_in: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a specific campaign.
    """
    campaign = db.query(Campaign).filter(
        Campaign.campaign_id == campaign_id,
        Campaign.user_id == current_user.user_id
    ).first()
    
    if not campaign:
        raise CampaignNotFoundException()
        
    if campaign_in.name is not None:
        campaign.name = campaign_in.name
    if campaign_in.description is not None:
        campaign.description = campaign_in.description
    if campaign_in.banner_color is not None:
        campaign.banner_color = campaign_in.banner_color
    if campaign_in.banner_image_url is not None:
        campaign.banner_image_url = None if campaign_in.banner_image_url == "" else campaign_in.banner_image_url
        
    try:
        db.commit()
        db.refresh(campaign)
    except SQLAlchemyError as exc:
        db.rollback()
        raise DatabaseUpdateException() from exc
    return campaign


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a specific campaign.
    """
    campaign = db.query(Campaign).filter(
        Campaign.campaign_id == campaign_id,
        Campaign.user_id == current_user.user_id
    ).first()
    
    if not campaign:
        raise CampaignNotFoundException()
        
    try:
        db.delete(campaign)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise DatabaseUpdateException() from exc
    return None
