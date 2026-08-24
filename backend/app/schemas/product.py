from pydantic import BaseModel, ConfigDict, computed_field, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from urllib.parse import urlparse


def _validate_affiliate_link(value: Optional[str]) -> Optional[str]:
    """Accept an optional, ordinary HTTPS affiliate URL without altering it."""
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    parsed = urlparse(normalized)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("affiliate_link must be a valid HTTPS URL")
    return normalized


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

    _validate_affiliate_link_field = field_validator("affiliate_link")(_validate_affiliate_link)


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    description: Optional[str] = None
    affiliate_link: Optional[str] = None
    brand_logo_url: Optional[str] = None
    campaign_id: Optional[UUID] = None

    _validate_affiliate_link_field = field_validator("affiliate_link")(_validate_affiliate_link)


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
    reel_count: int = 0

    @computed_field
    @property
    def status(self) -> str:
        is_complete = all(
            (
                bool(self.product_name and self.product_name.strip()),
                bool(self.description and self.description.strip()),
                bool(self.affiliate_link and self.affiliate_link.strip()),
                bool(self.images),
            )
        )
        return "Active" if is_complete else "Draft"

    @computed_field
    @property
    def primary_image_url(self) -> Optional[str]:
        """
        Resolve the primary product image to an accessible URL for the frontend.

        Product images are stored as R2 object keys (relative paths) in the DB.
        Uses get_presigned_url() so the image is accessible even when the R2 bucket
        is not set to public — the presigned URL is valid for 1 hour which is
        sufficient for any page session or generation pipeline run.
        """
        from app.services.storage_service import get_presigned_url
        primary = next((img for img in self.images if img.is_primary), None)
        if not primary and self.images:
            primary = self.images[0]
        return get_presigned_url(primary.image_url) if primary else None


class ProductListResponse(BaseModel):
    products: List[ProductResponse]
    total: int
