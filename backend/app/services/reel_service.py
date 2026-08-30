"""
CRUD operations for Reels.
"""

from uuid import UUID
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Reel


def create_reel(
    db: Session,
    *,
    user_id: UUID,
    prompt_text: str,
    product_id: Optional[UUID] = None,
) -> Reel:
    reel = Reel(
        user_id=user_id,
        product_id=product_id,
        prompt_text=prompt_text,
        caption_and_hashtags={"caption": "", "hashtags": []}
    )
    db.add(reel)
    db.commit()
    db.refresh(reel)
    return reel


def get_reel(db: Session, *, reel_id: UUID, user_id: UUID) -> Optional[Reel]:
    return (
        db.query(Reel)
        .filter(
            Reel.reel_id == reel_id,
            Reel.user_id == user_id,
            Reel.deleted_at.is_(None),
        )
        .first()
    )


def get_reels(
    db: Session,
    *,
    user_id: UUID,
    product_id: Optional[UUID] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Reel], int]:
    # Only explicitly-saved reels are browsable — a Completed reel doesn't
    # appear here until the member clicks Save on the Create page. Nothing
    # currently needs the unsaved ones through this listing endpoint (the
    # Create page's own in-progress/just-finished reel is fetched by id via
    # get_reel(), not this list).
    base = db.query(Reel).filter(
        Reel.user_id == user_id,
        Reel.deleted_at.is_(None),
        Reel.is_saved.is_(True),
    )
    if product_id:
        base = base.filter(Reel.product_id == product_id)
    if status:
        base = base.filter(Reel.status == status)

    total = base.with_entities(func.count(Reel.reel_id)).scalar()
    items = base.order_by(Reel.created_at.desc()).offset(skip).limit(limit).all()
    return items, total


def update_reel(
    db: Session,
    *,
    reel: Reel,
    prompt_text: Optional[str] = None,
    caption_and_hashtags: Optional[dict] = None,
    uploaded_video_url: Optional[str] = None,
    b_roll_url: Optional[str] = None,
    clear_b_roll: bool = False,
    raw_video_url: Optional[str] = None,
    first_frame_url: Optional[str] = None,
    final_commercial_video_url: Optional[str] = None,
    status: Optional[str] = None,
    error_message: Optional[str] = None,
    is_saved: Optional[bool] = None,
) -> Reel:
    """
    Update mutable fields on a Reel ORM instance and commit to DB.

    Args:
        clear_b_roll: If True, set b_roll_url to None (clear the hybrid-generation checkpoint).
            Use this on intentional re-generation so the worker starts fresh (not from a checkpoint).
            The b_roll_url check in update_reel skips None values to avoid accidental clears,
            so an explicit flag is needed when you deliberately want to clear it.
    """
    if prompt_text is not None:
        reel.prompt_text = prompt_text
    if caption_and_hashtags is not None:
        reel.caption_and_hashtags = caption_and_hashtags
    if uploaded_video_url is not None:
        reel.uploaded_video_url = uploaded_video_url
    if b_roll_url is not None:
        reel.b_roll_url = b_roll_url
    elif clear_b_roll:
        # Explicit clear — needed for intentional regen (not just "no value passed")
        reel.b_roll_url = None
    if raw_video_url is not None:
        # Pre-overlay video URL — stored before logo is baked so Option B download works
        reel.raw_video_url = raw_video_url
    if first_frame_url is not None:
        reel.first_frame_url = first_frame_url
    if final_commercial_video_url is not None:
        reel.final_commercial_video_url = final_commercial_video_url
    if status is not None:
        reel.status = status
    if error_message is not None:
        reel.error_message = error_message
    if is_saved is not None:
        reel.is_saved = is_saved
    db.commit()
    db.refresh(reel)
    return reel


def save_reel(db: Session, *, reel: Reel, caption_and_hashtags: Optional[dict] = None) -> Reel:
    """
    Snapshot the reel's current (live) prompt/caption/video into its saved_*
    columns and mark it saved — the action behind the Create page's Save
    button. Library, the Distribute picker, and publishing all read the
    saved_* columns, not the live ones, so this is the only thing that makes
    a reel (re)appear there.

    caption_and_hashtags, if given, is written to the live column first —
    the caption textarea's edits are only ever local React state until this
    call, since there's no other endpoint that persists a manually-typed
    caption (only regenerating it via Gemini does).
    """
    if caption_and_hashtags is not None:
        reel.caption_and_hashtags = caption_and_hashtags
    reel.saved_prompt_text = reel.prompt_text
    reel.saved_caption_and_hashtags = reel.caption_and_hashtags
    reel.saved_raw_video_url = reel.raw_video_url
    reel.saved_first_frame_url = reel.first_frame_url
    reel.saved_final_commercial_video_url = reel.final_commercial_video_url
    reel.is_saved = True
    db.commit()
    db.refresh(reel)
    return reel


def increment_retry(db: Session, *, reel: Reel) -> Reel:
    reel.retry_count = (reel.retry_count or 0) + 1
    db.commit()
    db.refresh(reel)
    return reel


def soft_delete_reel(db: Session, *, reel: Reel) -> Reel:
    reel.deleted_at = func.now()
    db.commit()
    db.refresh(reel)
    return reel
