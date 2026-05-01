import smtplib
from email.message import EmailMessage
from app.core.config import (
    SMTP_SERVER,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    FRONTEND_URL,
)


def send_verification_email(email_to: str, token: str):
    """Send an email-verification link to the given address."""
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("SMTP_USERNAME or SMTP_PASSWORD not set. Email will only be printed to console.")
        return

    msg = EmailMessage()
    msg["Subject"] = "Verify your ReelCast Account"
    msg["From"] = SMTP_USERNAME
    msg["To"] = email_to

    verify_url = f"{FRONTEND_URL}/verify-email?token={token}"
    msg.set_content(
        f"Welcome to ReelCast!\n\n"
        f"Please verify your email by clicking the link below:\n\n"
        f"{verify_url}"
    )

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            print(f"[{email_to}] Verification email sent successfully!")
    except Exception as e:
        print(f"Failed to send email to {email_to}: {e}")


def send_password_reset_email(email_to: str, token: str):
    """Send a password-reset link to the given address."""
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("SMTP_USERNAME or SMTP_PASSWORD not set. Password reset email will only be printed to console.")
        return

    msg = EmailMessage()
    msg["Subject"] = "Reset your ReelCast Password"
    msg["From"] = SMTP_USERNAME
    msg["To"] = email_to

    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    msg.set_content(
        f"Hello,\n\n"
        f"We received a request to reset your ReelCast account password.\n\n"
        f"Click the link below to reset your password:\n\n"
        f"{reset_url}\n\n"
        f"This link will expire in 30 minutes.\n\n"
        f"If you didn't request this, you can safely ignore this email.\n\n"
        f"— The ReelCast Team"
    )

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            print(f"[{email_to}] Password reset email sent successfully!")
    except Exception as e:
        print(f"Failed to send password reset email to {email_to}: {e}")
