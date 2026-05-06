from pydantic import BaseModel, ConfigDict
from typing import Optional, List
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
