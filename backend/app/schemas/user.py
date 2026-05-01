from pydantic import BaseModel, EmailStr
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    is_email_verified: bool
    is_2fa_enabled: bool = False

    class Config:
        from_attributes = True


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
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
