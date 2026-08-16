from pydantic import BaseModel, ConfigDict
from typing import Literal, Optional, List
from uuid import UUID
from datetime import datetime, date


# ────────────────────────── Analytics ──────────────────────────


class AnalyticsCreate(BaseModel):
    distribution_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    source_platform: Optional[str] = None
    views: int = 0
    clicks: int = 0
    orders: int = 0
    revenue: float = 0
    record_date: Optional[date] = None


class AnalyticsUpdate(BaseModel):
    views: Optional[int] = None
    clicks: Optional[int] = None
    orders: Optional[int] = None
    revenue: Optional[float] = None
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
    revenue: float = 0
    record_date: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AnalyticsListResponse(BaseModel):
    analytics: List[AnalyticsResponse]
    total: int


# ────────────────────────── Feature 5: Data Tracking ──────────────────────────

EcommercePlatform = Literal["tiktok_shop", "shopee", "lazada"]


class EcommerceAccountConnect(BaseModel):
    platform_name: EcommercePlatform
    external_shop_id: str
    access_token: str
    refresh_token: Optional[str] = None
    shop_name: Optional[str] = None


class EcommerceAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ecommerce_account_id: UUID
    platform_name: str
    external_shop_id: str
    shop_name: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    sync_error: Optional[str] = None
    created_at: datetime


class TrackingMetricCreate(BaseModel):
    """Normalized provider output accepted from a shop/social sync adapter."""

    product_id: Optional[UUID] = None
    distribution_id: Optional[UUID] = None
    source_platform: str
    views: int = 0
    clicks: int = 0
    orders: int = 0
    revenue: float = 0
    record_date: date
