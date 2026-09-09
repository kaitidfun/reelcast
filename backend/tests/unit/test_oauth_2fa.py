import pytest
from tests.pytest_helpers import PytestAssertions

"""OAuth must complete TOTP verification before accessing member endpoints.

UTC: F1-UTC02, F1-UTC04
STC: STC-F1-01, STC-F1-02
"""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pyotp
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import ALGORITHM, SECRET_KEY
from app.dependencies import get_current_user, get_db
from app.exceptions import OAuthProviderException
from app.routes.oauth_routes import router as oauth_router
from app.routes.social_routes import connectSocialAccount
from app.routes.twofa_routes import router as twofa_router
from app.services.auth_service import create_access_token


class TestOAuthTwoFactorTests(PytestAssertions):
    def setup_method(self, _method):
        self.user = SimpleNamespace(
            user_id=uuid4(), email="member@example.com", display_name="Member",
            hashed_password=None, is_email_verified=False, is_2fa_enabled=True,
            two_factor_secret=pyotp.random_base32(),
        )
        self.db = MagicMock()
        self.db.query.return_value.filter.return_value.first.return_value = self.user
        app = FastAPI()
        app.include_router(oauth_router)
        app.include_router(twofa_router)
        app.dependency_overrides[get_db] = lambda: self.db

        @app.get("/me")
        async def me(user=Depends(get_current_user)):
            return {"email": user.email}

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def callback(self, provider):
        provider_client = MagicMock()
        self.user.email = "member@example.com" if provider == "google" else "123@facebook.com"
        provider_client.authorize_access_token = AsyncMock(return_value={
            "userinfo": {"email": self.user.email, "name": "Member"},
        })
        provider_client.get = AsyncMock(return_value=MagicMock(
            json=lambda: {"id": "123", "name": "Member"},
        ))
        with patch("app.routes.oauth_routes.oauth.create_client", return_value=provider_client):
            response = self.client.get(f"/auth/{provider}/callback", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        return response

    def test_both_providers_require_totp_before_access(self):
        for provider in ("google", "facebook"):
            with self.subTest(provider=provider):
                response = self.callback(provider)
                location = urlsplit(response.headers["location"])
                self.assertEqual(location.query, "")
                challenge = parse_qs(location.fragment)
                self.assertEqual(challenge["requires_2fa"], ["1"])
                token = challenge["temp_token"][0]
                claims = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                self.assertEqual(claims["type"], "2fa_challenge")
                self.assertEqual(claims["sub"], self.user.email)
                self.assertEqual(response.headers["cache-control"], "no-store")
                self.assertEqual(self.client.get("/me", headers={
                    "Authorization": f"Bearer {token}",
                }).status_code, 401)

                rejected = self.client.post("/api/2fa/verify", json={
                    "temp_token": token, "code": "invalid",
                })
                self.assertEqual(rejected.status_code, 401)
                self.assertNotIn("access_token", rejected.json())

                verified = self.client.post("/api/2fa/verify", json={
                    "temp_token": token,
                    "code": pyotp.TOTP(self.user.two_factor_secret).now(),
                })
                self.assertEqual(verified.status_code, 200)
                access_token = verified.json()["access_token"]
                self.assertEqual(self.client.get("/me", headers={
                    "Authorization": f"Bearer {access_token}",
                }).status_code, 200)

    def test_both_providers_without_2fa_still_sign_in_directly(self):
        self.user.is_2fa_enabled = False
        for provider in ("google", "facebook"):
            with self.subTest(provider=provider):
                location = urlsplit(self.callback(provider).headers["location"])
                self.assertEqual(location.fragment, "")
                token = parse_qs(location.query)["token"][0]
                self.assertEqual(self.client.get("/me", headers={
                    "Authorization": f"Bearer {token}",
                }).status_code, 200)

    def test_verification_rejects_expired_or_wrong_purpose_tokens(self):
        tokens = [
            create_access_token({"sub": self.user.email, "type": "2fa_challenge"}, timedelta(seconds=-1)),
            create_access_token({"sub": self.user.email}),
            "invalid-token",
        ]
        for token in tokens:
            with self.subTest(token=token):
                response = self.client.post("/api/2fa/verify", json={
                    "temp_token": token, "code": pyotp.TOTP(self.user.two_factor_secret).now(),
                })
                self.assertEqual(response.status_code, 401)

    def test_member_endpoints_reject_all_non_access_token_purposes(self):
        for purpose in ("2fa_challenge", "verify_email", "password_reset"):
            with self.subTest(purpose=purpose):
                token = create_access_token({"sub": self.user.email, "type": purpose})
                response = self.client.get("/me", headers={"Authorization": f"Bearer {token}"})
                self.assertEqual(response.status_code, 401)

    def test_oauth_account_can_disable_2fa_with_valid_totp(self):
        token = create_access_token({"sub": self.user.email})
        headers = {"Authorization": f"Bearer {token}"}
        rejected = self.client.post("/api/2fa/disable", headers=headers, json={"code": "invalid"})
        self.assertEqual(rejected.status_code, 401)
        self.assertTrue(self.user.is_2fa_enabled)
        response = self.client.post("/api/2fa/disable", headers=headers, json={
            "code": pyotp.TOTP(self.user.two_factor_secret).now(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.user.is_2fa_enabled)
        self.assertIsNone(self.user.two_factor_secret)

    def test_password_account_still_requires_password_to_disable_2fa(self):
        self.user.hashed_password = "stored-hash"
        token = create_access_token({"sub": self.user.email})
        with patch("app.routes.twofa_routes.verify_password", return_value=False):
            response = self.client.post("/api/2fa/disable", headers={
                "Authorization": f"Bearer {token}",
            }, json={"code": pyotp.TOTP(self.user.two_factor_secret).now()})
        self.assertEqual(response.status_code, 401)
        self.assertTrue(self.user.is_2fa_enabled)


class TestConnectionTokenTests(PytestAssertions):
    # UTC: F1-UTC02
    # STC: STC-F1-01
    @pytest.mark.asyncio
    async def test_social_connection_rejects_2fa_challenge(self):
        token = create_access_token({"sub": "member@example.com", "type": "2fa_challenge"})
        db = MagicMock()
        with self.assertRaises(OAuthProviderException):
            connectSocialAccount("facebook", MagicMock(), token, db=db)
        db.query.assert_not_called()
