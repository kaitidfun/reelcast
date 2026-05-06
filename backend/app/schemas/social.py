from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


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
