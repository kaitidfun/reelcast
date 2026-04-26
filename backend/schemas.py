from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime
from .models import AuthProvider

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    auth_provider: AuthProvider
    is_email_verified: bool
    is_2fa_enabled: bool
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
