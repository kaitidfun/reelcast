from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import timedelta
from jose import JWTError, jwt
import pyotp
import qrcode
import io
import base64

from app.dependencies import get_db, get_current_user
from app.models.models import User
from app.schemas.user import TwoFactorVerifyRequest, TwoFactorLoginRequest, TwoFactorDisableRequest
from app.services.auth_service import verify_password, create_access_token
from app.core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(prefix="/api/2fa", tags=["2FA"])


@router.get("/status")
def get_2fa_status(current_user: User = Depends(get_current_user)):
    """Check if 2FA is enabled for the current user."""
    return {
        "is_2fa_enabled": current_user.is_2fa_enabled,
    }


@router.post("/enable")
def enable_2fa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 1 of 2FA setup: Generate a TOTP secret and return a QR code.
    The user must scan the QR code with their authenticator app,
    then verify with a code from the app to complete setup.
    """
    if current_user.is_2fa_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")

    # Generate a new TOTP secret
    secret = pyotp.random_base32()

    # Store the secret (not yet enabled until verified)
    current_user.two_factor_secret = secret
    db.commit()

    # Generate the provisioning URI for authenticator apps
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=current_user.email,
        issuer_name="ReelCast",
    )

    # Generate QR code as base64 image
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "provisioning_uri": provisioning_uri,
    }


@router.post("/verify-setup")
def verify_2fa_setup(
    body: TwoFactorVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2 of 2FA setup: Verify the TOTP code from the authenticator app.
    This confirms the user has correctly set up their authenticator and enables 2FA.
    """
    if current_user.is_2fa_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")

    if not current_user.two_factor_secret:
        raise HTTPException(status_code=400, detail="Please initiate 2FA setup first")

    totp = pyotp.TOTP(current_user.two_factor_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=400, detail="Invalid verification code. Please try again."
        )

    # Enable 2FA
    current_user.is_2fa_enabled = True
    db.commit()

    return {
        "message": "Two-factor authentication has been enabled successfully!",
        "is_2fa_enabled": True,
    }


@router.post("/verify")
def verify_2fa_login(body: TwoFactorLoginRequest, db: Session = Depends(get_db)):
    """
    Verify a 2FA code during login.
    Called after the initial login returns requires_2fa=True with a temp_token.
    """
    # Validate the temporary token
    try:
        payload = jwt.decode(body.temp_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != "2fa_challenge":
            raise HTTPException(status_code=401, detail="Invalid temporary token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired temporary token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_2fa_enabled or not user.two_factor_secret:
        raise HTTPException(status_code=400, detail="2FA is not enabled for this account")

    # Verify the TOTP code
    totp = pyotp.TOTP(user.two_factor_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")

    # Issue the real access token
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.user_id),
            "email": user.email,
            "display_name": user.display_name,
            "is_email_verified": user.is_email_verified,
            "is_2fa_enabled": user.is_2fa_enabled,
        },
    }


@router.post("/disable")
def disable_2fa(
    body: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Disable 2FA for the current user.
    Requires both the current TOTP code and account password for security.
    """
    if not current_user.is_2fa_enabled:
        raise HTTPException(status_code=400, detail="2FA is not currently enabled")

    # Verify password
    if not current_user.hashed_password or not verify_password(
        body.password, current_user.hashed_password
    ):
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Verify TOTP code
    totp = pyotp.TOTP(current_user.two_factor_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")

    # Disable 2FA
    current_user.is_2fa_enabled = False
    current_user.two_factor_secret = None
    db.commit()

    return {
        "message": "Two-factor authentication has been disabled.",
        "is_2fa_enabled": False,
    }
