from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.models import User, Reel
from app.services.reel_service import create_reel, get_reel
from app.worker import process_reel_generation
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/reels", tags=["Reels"])

class ReelGenerateRequest(BaseModel):
    prompt_text: str = Field(..., max_length=500, description="Max 500 characters")
    product_id: UUID
    platform: Optional[str] = "ig"
    overlay_position: Optional[str] = "bottom-right"

class ReelResponse(BaseModel):
    reel_id: UUID
    status: str
    prompt_text: str
    error_message: Optional[str] = None
    final_commercial_video_url: Optional[str] = None
    caption_and_hashtags: Optional[dict] = None

    class Config:
        from_attributes = True

@router.post("/generate", response_model=ReelResponse)
def trigger_generation(
    req: ReelGenerateRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Validation check
    if len(req.prompt_text) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt must be 500 characters or less.")
    
    # Create reel
    reel = create_reel(
        db=db, 
        user_id=current_user.user_id, 
        prompt_text=req.prompt_text, 
        product_id=req.product_id
    )
    
    # Send task to Celery
    process_reel_generation.delay(str(reel.reel_id), req.platform, req.overlay_position)
    
    return reel

@router.get("/{reel_id}/status", response_model=ReelResponse)
def get_generation_status(
    reel_id: UUID, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    reel = get_reel(db=db, reel_id=reel_id, user_id=current_user.user_id)
    if not reel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reel not found")
    
    return reel
