from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

ShopPlatform = Literal["tiktok_shop", "shopee", "lazada"]
Platform = Literal["tiktok_shop", "shopee", "lazada", "tiktok", "youtube", "facebook", "instagram"]


class TokenExchangeRequest(BaseModel):
    platform: ShopPlatform
    code: str = Field(min_length=1, max_length=4096)
    state: str = Field(min_length=8, max_length=1024)
    redirect_uri: HttpUrl


class TokenExchangeResponse(BaseModel):
    access_token: str = Field(min_length=1)
    refresh_token: str | None = None
    external_shop_id: str = Field(min_length=1)
    shop_name: str | None = None


class SyncRequest(BaseModel):
    platform: Platform
    account_id: str = Field(min_length=1, max_length=128)
    external_account_id: str = Field(min_length=1, max_length=256)
    access_token: str = Field(min_length=1, max_length=8192)
    from_date: date
    to_date: date
    # ReelCast supplies destination IDs it published itself.  This is needed
    # for private/unlisted social posts that a provider's channel search may
    # not return, and remains optional for backward-compatible adapter calls.
    known_post_ids: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def date_range_is_valid(self) -> "SyncRequest":
        if self.from_date > self.to_date:
            raise ValueError("from_date must not be after to_date")
        return self


class Metric(BaseModel):
    external_ref: str = Field(min_length=1, max_length=512)
    record_date: date
    views: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    orders: int = Field(default=0, ge=0)
    engagement: int = Field(default=0, ge=0)
    revenue: float = Field(default=0, ge=0)


class SyncResponse(BaseModel):
    metrics: list[Metric]
