"""
CRUD operations for Social Accounts.
"""

from uuid import UUID
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import SocialAccount


def create_social_account(
    db: Session,
    *,
    user_id: UUID,
    platform_name: str,
    access_token: str,
    refresh_token: Optional[str] = None,
) -> SocialAccount:
    account = SocialAccount(
        user_id=user_id,
        platform_name=platform_name,
        access_token=access_token,
        refresh_token=refresh_token,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def get_social_account(
    db: Session,
    *,
    account_id: UUID,
    user_id: UUID,
) -> Optional[SocialAccount]:
    return (
        db.query(SocialAccount)
        .filter(
            SocialAccount.account_id == account_id,
            SocialAccount.user_id == user_id,
        )
        .first()
    )


def get_social_accounts_by_user(
    db: Session,
    *,
    user_id: UUID,
) -> list[SocialAccount]:
    return (
        db.query(SocialAccount)
        .filter(SocialAccount.user_id == user_id)
        .order_by(SocialAccount.created_at.desc())
        .all()
    )


def update_social_account_tokens(
    db: Session,
    *,
    account: SocialAccount,
    access_token: str,
    refresh_token: Optional[str] = None,
) -> SocialAccount:
    account.access_token = access_token
    if refresh_token is not None:
        account.refresh_token = refresh_token
    db.commit()
    db.refresh(account)
    return account


def delete_social_account(db: Session, *, account_id: UUID, user_id: UUID) -> bool:
    account = get_social_account(db, account_id=account_id, user_id=user_id)
    if not account:
        return False
    db.delete(account)
    db.commit()
    return True
