from pydantic import BaseModel, ConfigDict, computed_field
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

    @computed_field
    @property
    def banner_url(self) -> Optional[str]:
        """Resolved presigned URL for banner_image_url (R2 key → accessible URL)."""
        from app.services.storage_service import get_presigned_url
        if not self.banner_image_url:
            return None
        return get_presigned_url(self.banner_image_url)


class CampaignListResponse(BaseModel):
    campaigns: List[CampaignResponse]
    total: int
