import bcrypt
from email_validator import EmailNotValidError, validate_email
from jose import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from app.core.config import SECRET_KEY, ALGORITHM
from app.exceptions import InvalidEmailFormatException, WeakPasswordException


def validate_registration_input(email: str, password: str) -> None:
    """Validate the registration fields defined by F1-UTC01."""
    try:
        validate_email(email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise InvalidEmailFormatException() from exc

    password_checks = (
        len(password) >= 6,
        any(character.isupper() for character in password),
        any(character.islower() for character in password),
        any(character.isdigit() for character in password),
        any(not character.isalnum() for character in password),
    )
    if not all(password_checks):
        raise WeakPasswordException()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def get_password_hash(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=15)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
