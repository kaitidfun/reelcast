from __future__ import annotations

import pytest
from tests.pytest_helpers import PytestAssertions

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.exceptions import DistributionPublishException
from app.models.models import Distribution, Product, Reel, SocialAccount
from app.worker import _format_caption, _publishDistribution, checkScheduledDistributions


class TestFormatCaptionTests(PytestAssertions):
    def test_none_returns_empty_string(self) -> None:
        self.assertEqual("", _format_caption(None))

    def test_joins_caption_and_hashtags(self) -> None:
        result = _format_caption({"caption": "Check this out", "hashtags": ["#reel", "#new"]})
        self.assertEqual("Check this out\n\n#reel #new", result)

    def test_affiliate_link_is_first_line(self) -> None:
        from app.worker import _prepend_affiliate_link

        result = _prepend_affiliate_link("Check this out\n\n#reel", " https://example.com/buy ")

        self.assertEqual("https://example.com/buy\n\nCheck this out\n\n#reel", result)

    def test_empty_caption_contains_only_affiliate_link(self) -> None:
        from app.worker import _prepend_affiliate_link

        self.assertEqual("https://example.com/buy", _prepend_affiliate_link("", "https://example.com/buy"))


class TestPublishDistributionTaskTests(PytestAssertions):
    def setup_method(self, _method) -> None:
        self.distribution_id = uuid4()
        self.reel_id = uuid4()
        self.account_id = uuid4()
        self.user_id = uuid4()

        self.distribution = Distribution(
            distribution_id=self.distribution_id,
            reel_id=self.reel_id,
            account_id=self.account_id,
            status="Pending",
        )
        self.reel = Reel(
            reel_id=self.reel_id,
            user_id=self.user_id,
            status="Completed",
            prompt_text="a reel",
            final_commercial_video_url="videos/reels/final/abc.mp4",
            caption_and_hashtags={"caption": "Buy now", "hashtags": ["#sale"]},
            is_saved=True,
            saved_final_commercial_video_url="videos/reels/final/abc.mp4",
            saved_caption_and_hashtags={"caption": "Buy now", "hashtags": ["#sale"]},
        )
        self.reel.product = Product(
            product_id=uuid4(),
            product_name="Featured product",
            affiliate_link="https://example.com/affiliate",
        )
        self.account = SocialAccount(
            account_id=self.account_id,
            user_id=self.user_id,
            platform_name="tiktok",
            access_token="encrypted-token",
        )

    def _db_returning(self, distribution=None, reel=None, account=None):
        db = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            if model is Distribution:
                q.filter.return_value.first.return_value = distribution
            elif model is Reel:
                q.filter.return_value.first.return_value = reel
            return q

        db.query.side_effect = query_side_effect
        return db

    @pytest.mark.asyncio
    async def test_missing_distribution_returns_without_error(self) -> None:
        db = self._db_returning(distribution=None)
        with patch("app.worker.SessionLocal", return_value=db):
            await _publishDistribution(str(self.distribution_id))  # should not raise
        db.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_reel_without_video_marks_failed(self) -> None:
        incomplete_reel = Reel(reel_id=self.reel_id, user_id=self.user_id, status="Generating", prompt_text="x")
        db = self._db_returning(distribution=self.distribution, reel=incomplete_reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "Failed"]
        self.assertEqual(1, len(failed_calls))
        self.assertIn("no saved video", failed_calls[0].kwargs["error_message"])

    @pytest.mark.asyncio
    async def test_missing_account_marks_failed(self) -> None:
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=None), \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "Failed"]
        self.assertEqual(1, len(failed_calls))
        self.assertIn("Connected account not found", failed_calls[0].kwargs["error_message"])

    @pytest.mark.asyncio
    async def test_successful_publish_marks_published(self) -> None:
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=self.account), \
             patch("app.worker.social_account_service.get_decrypted_access_token", return_value="plain-token"), \
             patch("app.worker.get_presigned_url", return_value="https://cdn.example.com/video.mp4"), \
             patch("app.worker.distribution_publish_service.publish", new=AsyncMock(return_value=("tiktok-post-id", None))) as mock_publish, \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        statuses = [c.kwargs.get("status") for c in mock_update.call_args_list]
        self.assertIn("Uploading", statuses)
        self.assertIn("Published", statuses)
        self.assertNotIn("Failed", statuses)
        published_call = next(call for call in mock_update.call_args_list if call.kwargs.get("status") == "Published")
        self.assertEqual("tiktok-post-id", published_call.kwargs["platform_post_id"])
        self.assertIsNone(published_call.kwargs["post_url"])
        self.assertEqual(
            "https://example.com/affiliate\n\nBuy now\n\n#sale",
            mock_publish.call_args.kwargs["caption"],
        )

    @pytest.mark.asyncio
    async def test_refreshes_access_token_before_publish_when_refresh_token_saved(self) -> None:
        account_with_refresh = SocialAccount(
            account_id=self.account_id,
            user_id=self.user_id,
            platform_name="youtube",
            access_token="encrypted-token",
            refresh_token="encrypted-refresh-token",
        )
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=account_with_refresh), \
             patch("app.worker.social_account_service.get_decrypted_access_token", return_value="stale-token"), \
             patch("app.worker.social_account_service.get_decrypted_refresh_token", return_value="plain-refresh-token"), \
             patch(
                 "app.worker.oauth_platforms.refresh_access_token",
                 new=AsyncMock(return_value={"access_token": "fresh-token", "refresh_token": None}),
             ) as mock_refresh, \
             patch("app.worker.social_account_service.update_social_account_tokens") as mock_update_tokens, \
             patch("app.worker.get_presigned_url", return_value="https://cdn.example.com/video.mp4"), \
             patch("app.worker.distribution_publish_service.publish", new=AsyncMock(return_value=("yt-video-id", "https://www.youtube.com/shorts/yt-video-id"))) as mock_publish, \
             patch("app.worker.distribution_service.update_distribution"):
            await _publishDistribution(str(self.distribution_id))

        mock_refresh.assert_awaited_once_with("youtube", "plain-refresh-token")
        mock_update_tokens.assert_called_once()
        self.assertEqual("fresh-token", mock_update_tokens.call_args.kwargs["access_token"])
        # The refreshed token — not the stale one — is what actually gets published with.
        self.assertEqual("fresh-token", mock_publish.call_args.kwargs["access_token"])

    @pytest.mark.asyncio
    async def test_refresh_failure_falls_back_to_existing_access_token(self) -> None:
        account_with_refresh = SocialAccount(
            account_id=self.account_id,
            user_id=self.user_id,
            platform_name="youtube",
            access_token="encrypted-token",
            refresh_token="encrypted-refresh-token",
        )
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=account_with_refresh), \
             patch("app.worker.social_account_service.get_decrypted_access_token", return_value="stale-token"), \
             patch("app.worker.social_account_service.get_decrypted_refresh_token", return_value="plain-refresh-token"), \
             patch(
                 "app.worker.oauth_platforms.refresh_access_token",
                 new=AsyncMock(side_effect=Exception("refresh endpoint down")),
             ), \
             patch("app.worker.get_presigned_url", return_value="https://cdn.example.com/video.mp4"), \
             patch("app.worker.distribution_publish_service.publish", new=AsyncMock(return_value=("yt-video-id", "https://www.youtube.com/shorts/yt-video-id"))) as mock_publish, \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        # Publish still goes through with the pre-refresh token instead of failing the distribution.
        self.assertEqual("stale-token", mock_publish.call_args.kwargs["access_token"])
        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "Failed"]
        self.assertEqual(0, len(failed_calls))

    @pytest.mark.asyncio
    async def test_publish_exception_marks_failed_and_retries(self) -> None:
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=self.account), \
             patch("app.worker.social_account_service.get_decrypted_access_token", return_value="plain-token"), \
             patch("app.worker.get_presigned_url", return_value="https://cdn.example.com/video.mp4"), \
             patch(
                 "app.worker.distribution_publish_service.publish",
                 new=AsyncMock(side_effect=DistributionPublishException("platform rejected it")),
             ), \
             patch("app.worker.distribution_service.increment_retry") as mock_retry, \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        mock_retry.assert_called_once()
        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "Failed"]
        self.assertEqual(1, len(failed_calls))
        # ReelCastException.__str__ prefixes the class name — matches how
        # every other exception's message is surfaced in this codebase.
        self.assertEqual("DistributionPublishException: platform rejected it", failed_calls[0].kwargs["error_message"])

    @pytest.mark.asyncio
    async def test_unexpected_publish_exception_marks_failed_instead_of_staying_uploading(self) -> None:
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=self.account), \
             patch("app.worker.social_account_service.get_decrypted_access_token", return_value="plain-token"), \
             patch("app.worker.get_presigned_url", return_value="https://cdn.example.com/video.mp4"), \
             patch("app.worker.distribution_publish_service.publish", new=AsyncMock(side_effect=RuntimeError("boom"))), \
             patch("app.worker.distribution_service.increment_retry") as mock_retry, \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        mock_retry.assert_called_once()
        failed_calls = [call for call in mock_update.call_args_list if call.kwargs.get("status") == "Failed"]
        self.assertEqual(1, len(failed_calls))
        self.assertEqual("Unexpected publishing error (RuntimeError)", failed_calls[0].kwargs["error_message"])


class TestCheckScheduledDistributionsTests(PytestAssertions):
    """Celery Beat's periodic task — claims due distributions and queues them."""

    def setup_method(self, _method) -> None:
        self.db = MagicMock()

    def test_claims_and_queues_due_distributions(self) -> None:
        due = [
            Distribution(distribution_id=uuid4(), status="Pending"),
            Distribution(distribution_id=uuid4(), status="Pending"),
        ]
        self.db.query.return_value.filter.return_value.all.return_value = due

        with patch("app.worker.SessionLocal", return_value=self.db), \
             patch("app.worker.distribution_service.claim_distribution_for_publish", side_effect=[True, True]) as mock_claim, \
             patch("app.worker.publishDistribution") as mock_task:
            checkScheduledDistributions()

        self.assertEqual(2, mock_claim.call_count)
        self.assertEqual(2, mock_task.delay.call_count)

    def test_already_claimed_distribution_is_not_queued_twice(self) -> None:
        due = [Distribution(distribution_id=uuid4(), status="Pending")]
        self.db.query.return_value.filter.return_value.all.return_value = due

        with patch("app.worker.SessionLocal", return_value=self.db), \
             patch("app.worker.distribution_service.claim_distribution_for_publish", return_value=False), \
             patch("app.worker.publishDistribution") as mock_task:
            checkScheduledDistributions()

        mock_task.delay.assert_not_called()

    def test_no_due_distributions_queues_nothing(self) -> None:
        self.db.query.return_value.filter.return_value.all.return_value = []

        with patch("app.worker.SessionLocal", return_value=self.db), \
             patch("app.worker.publishDistribution") as mock_task:
            checkScheduledDistributions()

        mock_task.delay.assert_not_called()
        self.db.close.assert_called_once()
