"""
CRUD operations for Products and ProductImages.
Products are always scoped to the authenticated user.
"""

from uuid import UUID, uuid4
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.exceptions import (
    CampaignNotFoundException,
    DatabaseInsertException,
    InvalidImageFormatException,
    MaxImagesExceededException,
)
from app.models.models import Campaign, Product, ProductImage
from app.schemas.product import ProductImageCreate


def createProduct(
    db: Session,
    *,
    userId: UUID,
    campaignId: UUID,
    productName: str,
    description: Optional[str] = None,
    affiliateLinks: Optional[str] = None,
    brandLogoUrl: Optional[str] = None,
    productImages: Optional[List[ProductImageCreate]] = None,
) -> Product:
    campaign = (
        db.query(Campaign)
        .filter(
            Campaign.campaign_id == campaignId,
            Campaign.user_id == userId,
            Campaign.deleted_at.is_(None),
        )
        .first()
    )
    if not campaign:
        raise CampaignNotFoundException()

    images = productImages or []
    if len(images) > 5:
        raise MaxImagesExceededException()

    supported_extensions = {".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"}
    for image in images:
        path = image.image_url.split("?", 1)[0].lower()
        if not any(path.endswith(extension) for extension in supported_extensions):
            raise InvalidImageFormatException(
                "Product images must use JPG, PNG, GIF, SVG, or WEBP format"
            )

    product = Product(
        user_id=userId,
        campaign_id=campaignId,
        product_name=productName.strip(),
        description=description,
        affiliate_link=affiliateLinks,
        brand_logo_url=brandLogoUrl,
    )
    try:
        db.add(product)
        db.flush()  # Get the product_id before inserting images

        for image in images:
            db_image = ProductImage(
                image_id=uuid4(),
                product_id=product.product_id,
                image_url=image.image_url,
                is_primary=image.is_primary,
            )
            db.add(db_image)

        db.commit()
        db.refresh(product)
    except SQLAlchemyError as exc:
        db.rollback()
        raise DatabaseInsertException() from exc
    return product


def get_product(db: Session, *, product_id: UUID, user_id: UUID) -> Optional[Product]:
    return (
        db.query(Product)
        .options(joinedload(Product.images))
        .filter(
            Product.product_id == product_id,
            Product.user_id == user_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )


def get_products(
    db: Session,
    *,
    user_id: UUID,
    campaign_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Product], int]:
    base = db.query(Product).filter(
        Product.user_id == user_id,
        Product.deleted_at.is_(None),
    )
    if campaign_id:
        base = base.filter(Product.campaign_id == campaign_id)

    total = base.with_entities(func.count(Product.product_id)).scalar()
    items = (
        base.options(joinedload(Product.images))
        .order_by(Product.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def update_product(
    db: Session,
    *,
    product: Product,
    product_name: Optional[str] = None,
    description: Optional[str] = None,
    affiliate_link: Optional[str] = None,
    brand_logo_url: Optional[str] = None,
    campaign_id: Optional[UUID] = None,
) -> Product:
    if product_name is not None:
        product.product_name = product_name
    if description is not None:
        product.description = description
    if affiliate_link is not None:
        product.affiliate_link = affiliate_link
    if brand_logo_url is not None:
        product.brand_logo_url = brand_logo_url
    if campaign_id is not None:
        product.campaign_id = campaign_id
    db.commit()
    db.refresh(product)
    return product


def soft_delete_product(db: Session, *, product: Product) -> Product:
    product.deleted_at = func.now()
    db.commit()
    db.refresh(product)
    return product


# ── Product Image helpers ──


def add_product_image(
    db: Session,
    *,
    product_id: UUID,
    image_url: str,
    is_primary: bool = False,
) -> ProductImage:
    image = ProductImage(
        image_id=uuid4(),
        product_id=product_id,
        image_url=image_url,
        is_primary=is_primary,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


def delete_product_image(db: Session, *, image_id: UUID) -> bool:
    image = db.query(ProductImage).filter(ProductImage.image_id == image_id).first()
    if not image:
        return False
    db.delete(image)
    db.commit()
    return True
