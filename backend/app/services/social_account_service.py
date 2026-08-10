"""
CRUD operations for Social Accounts.

access_token / refresh_token are encrypted at rest (see crypto_service) —
every write path here encrypts before it touches the ORM object, and
get_decrypted_access_token()/get_decrypted_refresh_token() are the only
supported way to read a usable token back out.
"""

from uuid import UUID
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import SocialAccount
from app.services.crypto_service import decrypt_token, encrypt_token


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
        access_token=encrypt_token(access_token),
        refresh_token=encrypt_token(refresh_token) if refresh_token else None,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def get_social_account_by_platform(
    db: Session,
    *,
    user_id: UUID,
    platform_name: str,
) -> Optional[SocialAccount]:
    return (
        db.query(SocialAccount)
        .filter(
            SocialAccount.user_id == user_id,
            SocialAccount.platform_name == platform_name,
        )
        .first()
    )


def get_decrypted_access_token(account: SocialAccount) -> str:
    return decrypt_token(account.access_token)


def get_decrypted_refresh_token(account: SocialAccount) -> Optional[str]:
    return decrypt_token(account.refresh_token) if account.refresh_token else None


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
    account.access_token = encrypt_token(access_token)
    if refresh_token is not None:
        account.refresh_token = encrypt_token(refresh_token)
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
