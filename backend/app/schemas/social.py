from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from uuid import UUID
from datetime import datetime


# ────────────────────────── Social Account ──────────────────────────


class SocialAccountCreate(BaseModel):
    platform_name: str
    access_token: str
    refresh_token: Optional[str] = None


class SocialAccountResponse(BaseModel):
    """
    Never include access_token/refresh_token here, encrypted or not — the
    frontend has no legitimate use for either, only the backend's own
    publish tasks do (via social_account_service.get_decrypted_*).
    """

    model_config = ConfigDict(from_attributes=True)

    account_id: UUID
    platform_name: str
    created_at: Optional[datetime] = None


class SocialAccountListResponse(BaseModel):
    accounts: List[SocialAccountResponse]
    total: int
