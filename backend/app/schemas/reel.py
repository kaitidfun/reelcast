from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime


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
