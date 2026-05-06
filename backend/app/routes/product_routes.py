from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from uuid import UUID
import uuid
from typing import List

from app.dependencies import get_db, get_current_user
from app.models.models import User, Product, ProductImage
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    ProductListResponse,
    ProductImageResponse,
)
from app.services.storage_service import upload_image, delete_file

router = APIRouter(prefix="/api/products", tags=["products"])


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new product.
    """
    # Verify campaign belongs to user
    from app.models.models import Campaign
    campaign = db.query(Campaign).filter(
        Campaign.campaign_id == product_in.campaign_id,
        Campaign.user_id == current_user.user_id
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    new_product = Product(
        user_id=current_user.user_id,
        campaign_id=product_in.campaign_id,
        product_name=product_in.product_name,
        description=product_in.description,
        affiliate_link=product_in.affiliate_link,
        brand_logo_url=product_in.brand_logo_url,
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    
    if product_in.images:
        for img_data in product_in.images:
            new_img = ProductImage(
                image_id=uuid.uuid4(),
                product_id=new_product.product_id,
                image_url=img_data.image_url,
                is_primary=img_data.is_primary
            )
            db.add(new_img)
        db.commit()
        db.refresh(new_product)
        
    return new_product


@router.get("", response_model=ProductListResponse)
def list_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    campaign_id: UUID = None,
    skip: int = 0,
    limit: int = 100,
):
    """
    List all products for the authenticated user. Optionally filter by campaign_id.
    """
    query = db.query(Product).filter(Product.user_id == current_user.user_id)
    
    if campaign_id:
        query = query.filter(Product.campaign_id == campaign_id)
        
    total = query.count()
    products = query.offset(skip).limit(limit).all()
    
    return {
        "products": products,
        "total": total
    }


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific product.
    """
    product = db.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.user_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: UUID,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a product.
    """
    product = db.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.user_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    if product_in.campaign_id is not None:
        # Verify new campaign belongs to user
        from app.models.models import Campaign
        campaign = db.query(Campaign).filter(
            Campaign.campaign_id == product_in.campaign_id,
            Campaign.user_id == current_user.user_id
        ).first()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        product.campaign_id = product_in.campaign_id

    if product_in.product_name is not None:
        product.product_name = product_in.product_name
    if product_in.description is not None:
        product.description = product_in.description
    if product_in.affiliate_link is not None:
        product.affiliate_link = product_in.affiliate_link
    if product_in.brand_logo_url is not None:
        product.brand_logo_url = product_in.brand_logo_url
        
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a product.
    """
    product = db.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.user_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    db.delete(product)
    db.commit()
    return None


@router.post("/{product_id}/upload-logo", response_model=ProductResponse)
async def upload_product_logo(
    product_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a brand logo for a specific product.
    """
    product = db.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.user_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    try:
        result = await upload_image(
            file,
            user_id=str(current_user.user_id),
            category="logos",
            prefix="products",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
        
    old_key = product.brand_logo_url
    if old_key:
        try:
            await delete_file(old_key)
        except Exception:
            pass
            
    product.brand_logo_url = result["key"]
    db.commit()
    db.refresh(product)
    
    return product


@router.post("/{product_id}/images", response_model=ProductImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    product_id: UUID,
    file: UploadFile = File(...),
    is_primary: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload an image for a specific product.
    """
    product = db.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.user_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    try:
        result = await upload_image(
            file,
            user_id=str(current_user.user_id),
            category="images",
            prefix="products",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
        
    if is_primary:
        # Unset primary from others
        for img in product.images:
            if img.is_primary:
                img.is_primary = False
        
    new_image = ProductImage(
        image_id=uuid.uuid4(),
        product_id=product.product_id,
        image_url=result["key"],
        is_primary=is_primary
    )
    db.add(new_image)
    db.commit()
    db.refresh(new_image)
    
    return new_image


@router.delete("/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_image(
    product_id: UUID,
    image_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a specific product image.
    """
    product = db.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.user_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    image = db.query(ProductImage).filter(
        ProductImage.image_id == image_id,
        ProductImage.product_id == product_id
    ).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
        
    # Delete from R2
    if image.image_url:
        try:
            await delete_file(image.image_url)
        except Exception:
            pass
            
    db.delete(image)
    db.commit()
    return None
