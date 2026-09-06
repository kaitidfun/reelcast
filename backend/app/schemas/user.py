from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime


MAX_DISPLAY_NAME_LENGTH = 50


def normalize_display_name(value: object) -> str:
    """Trim a display name and reject blank values."""
    if not isinstance(value, str):
        raise ValueError("Display name must be a string")
    normalized = value.strip()
    if not normalized:
        raise ValueError("Display name cannot be blank")
    return normalized


# ────────────────────────────── User ──────────────────────────────


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str = Field(max_length=MAX_DISPLAY_NAME_LENGTH)

    @field_validator("display_name", mode="before")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        return normalize_display_name(value)


class UserUpdate(BaseModel):
    display_name: str = Field(max_length=MAX_DISPLAY_NAME_LENGTH)

    @field_validator("display_name", mode="before")
    @classmethod
    def validate_display_name(cls, value: object) -> str:
        return normalize_display_name(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: Optional[str] = None
    display_name: str
    is_email_verified: bool
    is_2fa_enabled: bool = False
    has_password: bool = True
    profile_image: Optional[str] = None
    created_at: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class LoginResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[UserResponse] = None
    requires_2fa: bool = False
    temp_token: Optional[str] = None


class VerifyEmailRequest(BaseModel):
    token: str


class TwoFactorVerifyRequest(BaseModel):
    code: str


class TwoFactorLoginRequest(BaseModel):
    temp_token: str
    code: str


class TwoFactorDisableRequest(BaseModel):
    code: str
    password: str = ""


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
