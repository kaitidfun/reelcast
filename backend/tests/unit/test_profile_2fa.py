from __future__ import annotations

import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pyotp
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import UploadFile

from app.exceptions import (
    DatabaseUpdateException,
    FileSizeLimitExceededException,
    InvalidImageFormatException,
    InvalidVerificationCodeException,
)
from app.routes.auth_routes import updateAccountProfile
from app.routes.twofa_routes import manage2FA
from app.routes.upload_routes import updateAccountProfileImage
from app.schemas.user import TwoFactorVerifyRequest, UserUpdate


class ProfileUpdateTests(unittest.TestCase):
    """F1-UTC03 display-name behavior."""

    def test_F1_UTC03_updates_display_name(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(display_name="Old Name")

        result = updateAccountProfile(
            UserUpdate(display_name="New Name"),
            db,
            user,
        )

        self.assertIs(user, result)
        self.assertEqual("New Name", user.display_name)
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(user)

    def test_F1_UTC03_maps_display_name_db_failure(self) -> None:
        db = MagicMock()
        db.commit.side_effect = SQLAlchemyError("update failed")
        user = SimpleNamespace(display_name="Old Name")

        with self.assertRaises(DatabaseUpdateException):
            updateAccountProfile(
                UserUpdate(display_name="New Name"),
                db,
                user,
            )

        db.rollback.assert_called_once()


class ProfileImageTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(
            user_id=uuid4(),
            profile_image=None,
        )

    @staticmethod
    def upload(filename: str, data: bytes) -> UploadFile:
        return UploadFile(io.BytesIO(data), filename=filename)

    @patch(
        "app.routes.upload_routes.upload_image",
        new_callable=AsyncMock,
        return_value={"key": "images/users/avatar/profile.jpg"},
    )
    async def test_F1_UTC03_TC01_accepts_valid_jpg(self, _upload_image) -> None:
        result = await updateAccountProfileImage(
            self.upload("profile_valid.jpg", b"x" * (3 * 1024 * 1024)),
            self.user,
            self.db,
        )

        self.assertEqual("images/users/avatar/profile.jpg", result["profile_image"])
        self.assertEqual(result["profile_image"], self.user.profile_image)

    async def test_F1_UTC03_TC02_rejects_gif(self) -> None:
        with self.assertRaises(InvalidImageFormatException):
            await updateAccountProfileImage(
                self.upload("profile_invalid.gif", b"gif-data"),
                self.user,
                self.db,
            )

    async def test_F1_UTC03_TC03_rejects_image_over_5mb(self) -> None:
        with self.assertRaises(FileSizeLimitExceededException):
            await updateAccountProfileImage(
                self.upload("profile_oversize.png", b"x" * (5 * 1024 * 1024 + 1)),
                self.user,
                self.db,
            )

    @patch(
        "app.routes.upload_routes.upload_image",
        new_callable=AsyncMock,
        return_value={"key": "images/users/avatar/profile.jpg"},
    )
    async def test_F1_UTC03_TC04_maps_image_database_failure(
        self,
        _upload_image,
    ) -> None:
        self.db.commit.side_effect = SQLAlchemyError("update failed")

        with self.assertRaises(DatabaseUpdateException):
            await updateAccountProfileImage(
                self.upload("profile_valid.jpg", b"jpg-data"),
                self.user,
                self.db,
            )


class TwoFactorTests(unittest.TestCase):
    """F1-UTC04 TOTP verification behavior."""

    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(
            is_2fa_enabled=False,
            two_factor_secret="secret",
        )

    def test_F1_UTC04_TC01_enables_2fa_for_valid_totp(self) -> None:
        secret = pyotp.random_base32()
        self.user.two_factor_secret = secret
        valid_code = pyotp.TOTP(secret).now()

        result = manage2FA(
            TwoFactorVerifyRequest(code=valid_code),
            self.user,
            self.db,
        )

        self.assertTrue(result["is_2fa_enabled"])
        self.assertTrue(self.user.is_2fa_enabled)
        self.db.commit.assert_called_once()

    @patch("app.routes.twofa_routes.pyotp.TOTP")
    def test_F1_UTC04_TC02_and_TC03_reject_invalid_or_empty_totp(
        self,
        totp_cls,
    ) -> None:
        totp_cls.return_value.verify.return_value = False

        for code in ("000000", ""):
            with self.subTest(code=code):
                with self.assertRaises(InvalidVerificationCodeException):
                    manage2FA(
                        TwoFactorVerifyRequest(code=code),
                        self.user,
                        self.db,
                    )
