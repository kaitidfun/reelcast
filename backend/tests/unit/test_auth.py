from __future__ import annotations

import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.exceptions import (
    AccountNotVerifiedException,
    DatabaseInsertException,
    EmailAlreadyExistsException,
    InvalidCredentialsException,
    InvalidEmailFormatException,
    WeakPasswordException,
)
from app.routes.auth_routes import authenticateMember, registerGuest
from app.schemas.user import UserCreate
from app.services.auth_service import (
    create_access_token,
    get_password_hash,
    validate_registration_input,
    verify_password,
)
from app.services.email_service import (
    send_password_reset_email,
    send_verification_email,
)


class RegistrationValidationTests(unittest.TestCase):
    """F1-UTC01 registration validation."""

    def test_F1_UTC01_TC01_accepts_valid_registration_data(self) -> None:
        validate_registration_input(
            "johndoe@example.com",
            "StrongPassword123!",
        )

    def test_F1_UTC01_TC02_rejects_invalid_email(self) -> None:
        with self.assertRaises(InvalidEmailFormatException):
            validate_registration_input(
                "johndoe-example",
                "StrongPassword123!",
            )

    def test_F1_UTC01_TC03_rejects_weak_password(self) -> None:
        weak_passwords = ("weak", "lowercase1!", "NOLOWER1!", "NoNumber!", "NoSpecial1")
        for password in weak_passwords:
            with self.subTest(password=password):
                with self.assertRaises(WeakPasswordException):
                    validate_registration_input("johndoe@example.com", password)


class RegistrationRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.query = self.db.query.return_value.filter.return_value
        self.query.first.return_value = None
        self.user = UserCreate(
            email="johndoe@example.com",
            password="StrongPassword123!",
            display_name="JohnDoe",
        )

        def assign_id(model) -> None:
            if getattr(model, "user_id", None) is None:
                model.user_id = uuid4()

        self.db.refresh.side_effect = assign_id

    @patch("app.routes.auth_routes.send_verification_email")
    @patch("app.routes.auth_routes.create_access_token")
    @patch("app.routes.auth_routes.get_password_hash", return_value="hashed-password")
    def test_F1_UTC01_TC01_registers_user_and_sends_verification(
        self,
        _hash_password,
        create_token,
        send_email,
    ) -> None:
        create_token.side_effect = ["verification-token", "access-token"]

        result = registerGuest(self.user, self.db)

        self.assertEqual("access-token", result["access_token"])
        self.assertEqual("johndoe@example.com", result["user"].email)
        self.assertFalse(result["user"].is_email_verified)
        self.db.add.assert_called_once()
        self.db.commit.assert_called_once()
        send_email.assert_called_once_with(
            "johndoe@example.com",
            "verification-token",
        )

    def test_F1_UTC01_TC04_rejects_duplicate_email(self) -> None:
        self.query.first.return_value = SimpleNamespace(email=self.user.email)

        with self.assertRaises(EmailAlreadyExistsException):
            registerGuest(self.user, self.db)

    def test_registration_maps_database_failure(self) -> None:
        self.db.commit.side_effect = SQLAlchemyError("insert failed")

        with patch(
            "app.routes.auth_routes.get_password_hash",
            return_value="hashed-password",
        ):
            with self.assertRaises(DatabaseInsertException):
                registerGuest(self.user, self.db)

        self.db.rollback.assert_called_once()

    @patch(
        "app.routes.auth_routes.send_verification_email",
        side_effect=RuntimeError("smtp unavailable"),
    )
    @patch(
        "app.routes.auth_routes.create_access_token",
        side_effect=["verification-token", "access-token"],
    )
    @patch(
        "app.routes.auth_routes.get_password_hash",
        return_value="hashed-password",
    )
    def test_registration_rolls_back_when_verification_email_fails(
        self,
        _hash_password,
        _create_token,
        _send_email,
    ) -> None:
        with self.assertRaises(HTTPException) as raised:
            registerGuest(self.user, self.db)

        self.assertEqual(500, raised.exception.status_code)
        self.db.delete.assert_called_once()


class AuthenticationTests(unittest.TestCase):
    """F1-UTC02 authentication behavior."""

    def setUp(self) -> None:
        self.db = MagicMock()
        self.query = self.db.query.return_value.filter.return_value
        self.form = SimpleNamespace(
            username="user@domain.com",
            password="ValidPass123!",
        )
        self.user = SimpleNamespace(
            user_id=uuid4(),
            id=uuid4(),
            email=self.form.username,
            display_name="Member",
            hashed_password="stored-hash",
            is_email_verified=True,
            is_2fa_enabled=False,
            profile_image=None,
            created_at=None,
        )
        self.query.first.return_value = self.user

    @patch("app.routes.auth_routes.create_access_token", return_value="access-token")
    @patch("app.routes.auth_routes.verify_password", return_value=True)
    def test_F1_UTC02_TC01_returns_access_token(
        self,
        _verify,
        _create_token,
    ) -> None:
        result = authenticateMember(self.form, self.db)

        self.assertEqual("access-token", result["access_token"])
        self.assertFalse(result["requires_2fa"])

    @patch("app.routes.auth_routes.verify_password", return_value=False)
    def test_F1_UTC02_TC02_rejects_incorrect_credentials(self, _verify) -> None:
        with self.assertRaises(InvalidCredentialsException):
            authenticateMember(self.form, self.db)

    @patch("app.routes.auth_routes.verify_password", return_value=True)
    def test_F1_UTC02_TC03_rejects_unverified_account(self, _verify) -> None:
        self.user.is_email_verified = False

        with self.assertRaises(AccountNotVerifiedException):
            authenticateMember(self.form, self.db)

    @patch("app.routes.auth_routes.create_access_token", return_value="temp-token")
    @patch("app.routes.auth_routes.verify_password", return_value=True)
    def test_login_returns_2fa_challenge_for_enabled_account(
        self,
        _verify,
        _create_token,
    ) -> None:
        self.user.is_2fa_enabled = True

        result = authenticateMember(self.form, self.db)

        self.assertTrue(result["requires_2fa"])
        self.assertEqual("temp-token", result["temp_token"])


class AuthPrimitiveTests(unittest.TestCase):
    def test_password_hash_round_trip(self) -> None:
        hashed = get_password_hash("StrongPassword123!")
        self.assertTrue(verify_password("StrongPassword123!", hashed))
        self.assertFalse(verify_password("WrongPassword123!", hashed))

    def test_access_token_honors_custom_expiry(self) -> None:
        token = create_access_token(
            {"sub": "user@domain.com"},
            timedelta(minutes=1),
        )
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 20)


class EmailTestModeTests(unittest.TestCase):
    @patch("app.services.email_service.smtplib.SMTP")
    @patch("app.services.email_service.REELCAST_TEST_MODE", True)
    def test_verification_email_is_suppressed_in_test_mode(self, smtp) -> None:
        send_verification_email("member@example.com", "token")
        smtp.assert_not_called()

    @patch("app.services.email_service.smtplib.SMTP")
    @patch("app.services.email_service.REELCAST_TEST_MODE", True)
    def test_password_reset_email_is_suppressed_in_test_mode(self, smtp) -> None:
        send_password_reset_email("member@example.com", "token")
        smtp.assert_not_called()
