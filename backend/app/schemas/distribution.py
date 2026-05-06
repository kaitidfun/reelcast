from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime


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
