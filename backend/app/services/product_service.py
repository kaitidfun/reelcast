"""
CRUD operations for Products and ProductImages.
Products are always scoped to the authenticated user.
"""

from uuid import UUID, uuid4
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.models import Product, ProductImage
from app.schemas.user import ProductImageCreate


def create_product(
    db: Session,
    *,
    user_id: UUID,
    campaign_id: UUID,
    product_name: str,
    description: Optional[str] = None,
    affiliate_link: Optional[str] = None,
    brand_logo_url: Optional[str] = None,
    images: Optional[List[ProductImageCreate]] = None,
) -> Product:
    product = Product(
        user_id=user_id,
        campaign_id=campaign_id,
        product_name=product_name,
        description=description,
        affiliate_link=affiliate_link,
        brand_logo_url=brand_logo_url,
    )
    db.add(product)
    db.flush()  # Get the product_id before inserting images

    if images:
        for img in images:
            db_image = ProductImage(
                image_id=uuid4(),
                product_id=product.product_id,
                image_url=img.image_url,
                is_primary=img.is_primary,
            )
            db.add(db_image)

    db.commit()
    db.refresh(product)
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
