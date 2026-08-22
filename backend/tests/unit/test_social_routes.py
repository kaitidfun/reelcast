from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx

from app.exceptions import OAuthProviderException
from app.models.models import SocialAccount
from app.routes.social_routes import (
    connectSocialAccount,
    disconnectSocialAccount,
    list_social_accounts,
    socialAccountCallback,
    social_platform_readiness,
)
from app.services import social_account_service
from app.services.crypto_service import decrypt_token
from app.services import oauth_platforms
from app.services.oauth_platforms import (
    build_authorize_url,
    exchange_code_for_token,
    fetch_external_account_id,
    is_configured,
    refresh_access_token,
)


class OAuthPlatformConfigTests(unittest.IsolatedAsyncioTestCase):
    """oauth_platforms.py: authorize URL building and token exchange."""

    def test_unconfigured_platform_reports_not_configured(self) -> None:
        # No client id/secret set in this test env — matches "before the
        # dev app is registered" state described in the .env.example notes.
        self.assertFalse(is_configured("tiktok"))
        with self.assertRaises(OAuthProviderException):
            build_authorize_url("tiktok", state="abc")

    def test_unknown_platform_raises(self) -> None:
        with self.assertRaises(OAuthProviderException):
            build_authorize_url("myspace", state="abc")

    @patch("app.services.oauth_platforms.is_configured", return_value=True)
    def test_authorize_url_uses_platform_specific_client_id_param(self, _cfg) -> None:
        patched_tiktok_config = {**oauth_platforms.PLATFORM_CONFIGS["tiktok"], "client_id": "test-client-key"}
        with patch.dict(oauth_platforms.PLATFORM_CONFIGS, {"tiktok": patched_tiktok_config}):
            url = build_authorize_url("tiktok", state="xyz")
        self.assertIn("client_key=test-client-key", url)
        self.assertIn("state=xyz", url)

    def test_tiktok_scope_covers_publish_and_tracking(self) -> None:
        scopes = set(oauth_platforms.PLATFORM_CONFIGS["tiktok"]["scope"].split(","))
        self.assertTrue({"user.info.basic", "video.publish", "video.list"}.issubset(scopes))

    async def test_exchange_code_raises_on_missing_access_token(self) -> None:
        with patch("app.services.oauth_platforms.is_configured", return_value=True), \
             patch("app.services.oauth_platforms.httpx.AsyncClient") as mock_client_cls:
            mock_response = MagicMock()
            mock_response.json.return_value = {}
            mock_response.raise_for_status.return_value = None
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            with self.assertRaises(OAuthProviderException):
                await exchange_code_for_token("youtube", "some-code")

    async def test_refresh_access_token_returns_new_token(self) -> None:
        with patch("app.services.oauth_platforms.is_configured", return_value=True), \
             patch("app.services.oauth_platforms.httpx.AsyncClient") as mock_client_cls:
            mock_response = MagicMock()
            mock_response.json.return_value = {"access_token": "new-access-token"}
            mock_response.raise_for_status.return_value = None
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            result = await refresh_access_token("youtube", "some-refresh-token")

        self.assertEqual("new-access-token", result["access_token"])
        post_kwargs = mock_client.post.call_args.kwargs
        self.assertEqual("refresh_token", post_kwargs["data"]["grant_type"])
        self.assertEqual("some-refresh-token", post_kwargs["data"]["refresh_token"])

    async def test_refresh_access_token_raises_on_missing_access_token(self) -> None:
        with patch("app.services.oauth_platforms.is_configured", return_value=True), \
             patch("app.services.oauth_platforms.httpx.AsyncClient") as mock_client_cls:
            mock_response = MagicMock()
            mock_response.json.return_value = {}
            mock_response.raise_for_status.return_value = None
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            with self.assertRaises(OAuthProviderException):
                await refresh_access_token("youtube", "some-refresh-token")

    async def test_refresh_access_token_unconfigured_platform_raises(self) -> None:
        with self.assertRaises(OAuthProviderException):
            await refresh_access_token("tiktok", "some-refresh-token")

    async def test_fetch_external_account_id_youtube_returns_channel_id(self) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {"items": [{"id": "UC12345"}]}
        mock_response.raise_for_status.return_value = None
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        with patch("app.services.oauth_platforms.httpx.AsyncClient") as mock_client_cls:
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            result = await fetch_external_account_id("youtube", "some-token")

        self.assertEqual("UC12345", result)

    async def test_fetch_external_account_id_swallows_http_errors(self) -> None:
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.ConnectError("boom")

        with patch("app.services.oauth_platforms.httpx.AsyncClient") as mock_client_cls:
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            result = await fetch_external_account_id("youtube", "some-token")

        self.assertIsNone(result)


class SocialAccountEncryptionTests(unittest.TestCase):
    """Tokens must never be stored or returned in plaintext."""

    def setUp(self) -> None:
        self.db = MagicMock()
        self.user_id = uuid4()

    def test_create_social_account_encrypts_tokens(self) -> None:
        account = social_account_service.create_social_account(
            self.db,
            user_id=self.user_id,
            platform_name="tiktok",
            access_token="raw-access-token",
            refresh_token="raw-refresh-token",
        )
        self.assertNotEqual("raw-access-token", account.access_token)
        self.assertNotEqual("raw-refresh-token", account.refresh_token)
        self.assertEqual("raw-access-token", decrypt_token(account.access_token))
        self.assertEqual("raw-refresh-token", decrypt_token(account.refresh_token))

    def test_update_tokens_re_encrypts(self) -> None:
        account = SocialAccount(
            user_id=self.user_id,
            platform_name="youtube",
            access_token="placeholder",
        )
        social_account_service.update_social_account_tokens(
            self.db, account=account, access_token="new-token"
        )
        self.assertEqual(
            "new-token",
            social_account_service.get_decrypted_access_token(account),
        )


class SocialRoutesTests(unittest.IsolatedAsyncioTestCase):
    """Connect/callback/list/disconnect route behavior."""

    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4(), email="creator@example.com")

    def test_connect_unknown_platform_raises(self) -> None:
        request = SimpleNamespace(session={})
        with self.assertRaises(OAuthProviderException):
            connectSocialAccount("myspace", request, token="whatever", db=self.db)

    def test_connect_invalid_token_raises(self) -> None:
        request = SimpleNamespace(session={})
        with self.assertRaises(OAuthProviderException):
            connectSocialAccount("tiktok", request, token="not-a-real-jwt", db=self.db)

    @patch("app.routes.social_routes.jwt.decode")
    def test_connect_stashes_user_and_state_in_session(self, mock_decode) -> None:
        mock_decode.return_value = {"sub": self.user.email}
        self.db.query.return_value.filter.return_value.first.return_value = self.user
        request = SimpleNamespace(session={})

        with patch("app.routes.social_routes.build_authorize_url", return_value="https://example.com/authorize") as mock_build:
            response = connectSocialAccount("youtube", request, token="valid-jwt", db=self.db)

        self.assertEqual(str(self.user.user_id), request.session["reelcast_connect_user_id"])
        self.assertEqual("youtube", request.session["reelcast_connect_platform"])
        self.assertIn("reelcast_connect_state", request.session)
        mock_build.assert_called_once()
        self.assertEqual(307, response.status_code)  # RedirectResponse default

    @patch("app.routes.social_routes.jwt.decode")
    def test_connect_unconfigured_platform_returns_to_distribution(self, mock_decode) -> None:
        mock_decode.return_value = {"sub": self.user.email}
        self.db.query.return_value.filter.return_value.first.return_value = self.user
        request = SimpleNamespace(session={})

        with patch(
            "app.routes.social_routes.build_authorize_url",
            side_effect=OAuthProviderException("tiktok is not configured yet"),
        ):
            response = connectSocialAccount("tiktok", request, token="valid-jwt", db=self.db)

        self.assertIn("/distribute?error=", response.headers["location"])
        self.assertEqual({}, request.session)

    async def test_callback_rejects_state_mismatch(self) -> None:
        request = SimpleNamespace(session={
            "reelcast_connect_state": "expected-state",
            "reelcast_connect_platform": "tiktok",
            "reelcast_connect_user_id": str(uuid4()),
        })
        response = await socialAccountCallback(
            "tiktok", request, code="abc", state="wrong-state", error=None, db=self.db
        )
        self.assertIn("error=", response.headers["location"])

    async def test_callback_success_creates_social_account(self) -> None:
        user_id = uuid4()
        request = SimpleNamespace(session={
            "reelcast_connect_state": "s1",
            "reelcast_connect_platform": "tiktok",
            "reelcast_connect_user_id": str(user_id),
        })
        self.db.query.return_value.filter.return_value.first.return_value = None  # no existing account

        with patch(
            "app.routes.social_routes.exchange_code_for_token",
            new=AsyncMock(return_value={"access_token": "tok", "refresh_token": None}),
        ), patch(
            "app.routes.social_routes.fetch_external_account_id",
            new=AsyncMock(return_value="tiktok-open-id-123"),
        ):
            response = await socialAccountCallback(
                "tiktok", request, code="abc", state="s1", error=None, db=self.db
            )

        self.assertIn("connected=tiktok", response.headers["location"])
        self.db.add.assert_called_once()

    async def test_callback_does_not_connect_without_target_account_id(self) -> None:
        request = SimpleNamespace(session={
            "reelcast_connect_state": "s1",
            "reelcast_connect_platform": "facebook",
            "reelcast_connect_user_id": str(uuid4()),
        })
        with patch(
            "app.routes.social_routes.exchange_code_for_token",
            new=AsyncMock(return_value={"access_token": "tok", "refresh_token": None}),
        ), patch(
            "app.routes.social_routes.fetch_external_account_id",
            new=AsyncMock(return_value=None),
        ):
            response = await socialAccountCallback(
                "facebook", request, code="abc", state="s1", error=None, db=self.db
            )

        self.assertIn("/distribute?error=", response.headers["location"])
        self.db.add.assert_not_called()

    def test_list_social_accounts_returns_current_user_accounts_only(self) -> None:
        self.db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            SocialAccount(account_id=uuid4(), user_id=self.user.user_id, platform_name="tiktok")
        ]
        result = list_social_accounts(db=self.db, current_user=self.user)
        self.assertEqual(1, result.total)
        self.assertEqual("tiktok", result.accounts[0].platform_name)

    def test_disconnect_missing_account_raises_404(self) -> None:
        self.db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(Exception) as ctx:
            disconnectSocialAccount(uuid4(), db=self.db, current_user=self.user)
        self.assertEqual(404, getattr(ctx.exception, "status_code", None))

    def test_F3_UTC01_readiness_exposes_no_platform_credentials(self) -> None:
        with patch(
            "app.routes.social_routes.is_configured",
            side_effect=lambda platform: platform == "youtube",
        ):
            result = social_platform_readiness(current_user=SimpleNamespace())
        self.assertEqual(
            {"platforms": {"tiktok": False, "facebook": False, "instagram": False, "youtube": True}},
            result,
        )


if __name__ == "__main__":
    unittest.main()
