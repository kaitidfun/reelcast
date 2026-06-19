from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import timedelta

from app.dependencies import get_db, get_current_user
from app.exceptions import (
    AccountNotVerifiedException,
    DatabaseInsertException,
    DatabaseUpdateException,
    EmailAlreadyExistsException,
    InvalidCredentialsException,
    WeakPasswordException,
)
from app.models.models import User
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    Token,
    LoginResponse,
    VerifyEmailRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.services.auth_service import (
    verify_password,
    get_password_hash,
    create_access_token,
    validate_registration_input,
)
from app.services.email_service import (
    send_verification_email,
    send_password_reset_email,
)
from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    SECRET_KEY,
    ALGORITHM,
    FRONTEND_URL,
)
from jose import JWTError, jwt

router = APIRouter()


# ==================== Registration ====================

@router.post("/register", response_model=Token)
def registerGuest(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise EmailAlreadyExistsException()

    validate_registration_input(str(user.email), user.password)

    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=user.email,
        display_name=user.display_name,
        hashed_password=hashed_password,
        is_email_verified=False,
    )
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except SQLAlchemyError as exc:
        db.rollback()
        raise DatabaseInsertException() from exc

    # Generate an email verification token
    verification_token = create_access_token(
        data={"sub": new_user.email, "type": "verify_email"},
        expires_delta=timedelta(hours=24),
    )
    verification_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"
    print(f"\n[EMAIL LOG] Target Verification Link: {verification_link}\n")

    # Send verification email synchronously so failures can be caught
    try:
        send_verification_email(new_user.email, verification_token)
    except Exception as e:
        # Rollback the user creation to prevent orphaned records
        print(f"\n[REGISTER ERROR] Email sending failed, rolling back user creation: {e}\n")
        db.delete(new_user)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail="Registration failed due to an email delivery issue. Please try again later.",
        )

    access_token = create_access_token(
        data={"sub": new_user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer", "user": new_user}


@router.post("/api/auth/register")
def register_stub():
    return {"message": "Registration endpoint hit successfully"}


# ==================== Email Verification ====================

@router.post("/api/verify-email")
def verify_email_api(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    token = payload.token
    if not token:
        raise HTTPException(status_code=400, detail="Token is missing")
    try:
        payload_data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload_data.get("sub")
        token_type: str = payload_data.get("type")
        if email is None or token_type != "verify_email":
            raise HTTPException(status_code=400, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_email_verified:
        return {"message": "Email is already verified", "status": "success"}

    user.is_email_verified = True
    db.commit()

    return {"message": "Email successfully verified!", "status": "success"}


# ==================== Login ====================

@router.post("/login", response_model=LoginResponse)
def authenticateMember(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if (
        not user
        or not user.hashed_password
        or not verify_password(form_data.password, user.hashed_password)
    ):
        raise InvalidCredentialsException()
    if not user.is_email_verified:
        raise AccountNotVerifiedException()

    # If 2FA is enabled, return a temporary token instead of a full access token
    if user.is_2fa_enabled:
        temp_token = create_access_token(
            data={"sub": user.email, "type": "2fa_challenge"},
            expires_delta=timedelta(minutes=5),
        )
        return {
            "requires_2fa": True,
            "temp_token": temp_token,
        }

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
        "requires_2fa": False,
    }


# ==================== Current User ====================

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserResponse)
def updateAccountProfile(
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if user_update.display_name is not None:
        current_user.display_name = user_update.display_name
        try:
            db.commit()
            db.refresh(current_user)
        except SQLAlchemyError as exc:
            db.rollback()
            raise DatabaseUpdateException() from exc
    return current_user

# ==================== Password Management ====================

@router.post("/api/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change password for the currently authenticated user.
    Requires the current password for verification.
    """
    # Verify current password
    if not current_user.hashed_password or not verify_password(
        body.current_password, current_user.hashed_password
    ):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Validate new password
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=400, detail="New password must be at least 6 characters"
        )

    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from current password",
        )

    # Update password
    current_user.hashed_password = get_password_hash(body.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


@router.post("/api/forgot-password")
def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Request a password reset email.
    Always returns success to prevent email enumeration attacks.
    """
    user = db.query(User).filter(User.email == body.email).first()

    if user and user.hashed_password:
        # Generate a password reset token (30 min expiry)
        reset_token = create_access_token(
            data={"sub": user.email, "type": "password_reset"},
            expires_delta=timedelta(minutes=30),
        )
        reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
        print(f"\n[PASSWORD RESET] Reset link for {user.email}: {reset_link}\n")

        # Send email in background
        background_tasks.add_task(send_password_reset_email, user.email, reset_token)
    else:
        # Don't reveal whether the email exists
        print(f"\n[PASSWORD RESET] No account found for {body.email} (or OAuth-only account)\n")

    return {
        "message": "If an account with that email exists, a password reset link has been sent.",
        "status": "success",
    }


@router.post("/api/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Reset password using a valid reset token from the email link.
    """
    # Validate the reset token
    try:
        payload = jwt.decode(body.token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate new password
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )

    # Update password
    user.hashed_password = get_password_hash(body.new_password)
    db.commit()

    return {"message": "Password has been reset successfully", "status": "success"}
