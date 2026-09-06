from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


# ────────────────────────────── User ──────────────────────────────


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserUpdate(BaseModel):
    display_name: Optional[str] = None


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
