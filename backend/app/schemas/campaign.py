from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.models.models import BannerColor


# ────────────────────────── Campaign ──────────────────────────


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    banner_color: BannerColor = BannerColor.Twilight
    banner_image_url: Optional[str] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    banner_color: Optional[BannerColor] = None
    banner_image_url: Optional[str] = None


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    campaign_id: UUID
    user_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    banner_color: BannerColor
    banner_image_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CampaignListResponse(BaseModel):
    campaigns: List[CampaignResponse]
    total: int
