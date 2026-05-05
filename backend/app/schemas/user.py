from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date
from app.models.models import BannerColor


# ────────────────────────────── User ──────────────────────────────


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserUpdate(BaseModel):
    display_name: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: Optional[str] = None
    display_name: str
    is_email_verified: bool
    is_2fa_enabled: bool = False
    profile_image: Optional[str] = None
    created_at: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class LoginResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[UserResponse] = None
    requires_2fa: bool = False
    temp_token: Optional[str] = None


class VerifyEmailRequest(BaseModel):
    token: str


class TwoFactorVerifyRequest(BaseModel):
    code: str


class TwoFactorLoginRequest(BaseModel):
    temp_token: str
    code: str


class TwoFactorDisableRequest(BaseModel):
    code: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ────────────────────────── Social Account ──────────────────────────


class SocialAccountCreate(BaseModel):
    platform_name: str
    access_token: str
    refresh_token: Optional[str] = None


class SocialAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: UUID
    user_id: Optional[UUID] = None
    platform_name: str
    refresh_token: Optional[str] = None
    created_at: Optional[datetime] = None


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


# ────────────────────────── Product Image ──────────────────────────


class ProductImageCreate(BaseModel):
    image_url: str
    is_primary: bool = False


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    image_id: UUID
    product_id: Optional[UUID] = None
    image_url: str
    is_primary: Optional[bool] = False
    created_at: Optional[datetime] = None


# ────────────────────────── Product ──────────────────────────


class ProductCreate(BaseModel):
    campaign_id: UUID
    product_name: str
    description: Optional[str] = None
    affiliate_link: Optional[str] = None
    brand_logo_url: Optional[str] = None
    images: Optional[List[ProductImageCreate]] = None


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    description: Optional[str] = None
    affiliate_link: Optional[str] = None
    brand_logo_url: Optional[str] = None
    campaign_id: Optional[UUID] = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: UUID
    campaign_id: UUID
    user_id: Optional[UUID] = None
    product_name: str
    description: Optional[str] = None
    affiliate_link: Optional[str] = None
    brand_logo_url: Optional[str] = None
    images: List[ProductImageResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProductListResponse(BaseModel):
    products: List[ProductResponse]
    total: int


# ────────────────────────── Reel ──────────────────────────


class ReelCreate(BaseModel):
    product_id: Optional[UUID] = None
    prompt_text: str


class ReelUpdate(BaseModel):
    prompt_text: Optional[str] = None
    caption_and_hashtags: Optional[dict] = None
    uploaded_video_url: Optional[str] = None
    b_roll_url: Optional[str] = None
    final_commercial_video_url: Optional[str] = None
    status: Optional[str] = None
    error_message: Optional[str] = None


class ReelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reel_id: UUID
    user_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    prompt_text: str
    caption_and_hashtags: Optional[dict] = None
    uploaded_video_url: Optional[str] = None
    b_roll_url: Optional[str] = None
    final_commercial_video_url: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[datetime] = None


class ReelListResponse(BaseModel):
    reels: List[ReelResponse]
    total: int


# ────────────────────────── Distribution ──────────────────────────


class DistributionCreate(BaseModel):
    reel_id: UUID
    account_id: UUID
    scheduled_time: Optional[datetime] = None


class DistributionUpdate(BaseModel):
    scheduled_time: Optional[datetime] = None
    status: Optional[str] = None
    error_message: Optional[str] = None


class DistributionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    distribution_id: UUID
    reel_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    scheduled_time: Optional[datetime] = None
    status: str
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[datetime] = None


class DistributionListResponse(BaseModel):
    distributions: List[DistributionResponse]
    total: int


# ────────────────────────── Analytics ──────────────────────────


class AnalyticsCreate(BaseModel):
    distribution_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    source_platform: Optional[str] = None
    views: int = 0
    clicks: int = 0
    orders: int = 0
    record_date: Optional[date] = None


class AnalyticsUpdate(BaseModel):
    views: Optional[int] = None
    clicks: Optional[int] = None
    orders: Optional[int] = None
    source_platform: Optional[str] = None
    record_date: Optional[date] = None


class AnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    analytics_id: UUID
    distribution_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    source_platform: Optional[str] = None
    views: int = 0
    clicks: int = 0
    orders: int = 0
    record_date: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AnalyticsListResponse(BaseModel):
    analytics: List[AnalyticsResponse]
    total: int
