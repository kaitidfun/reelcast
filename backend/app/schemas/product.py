from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime


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
