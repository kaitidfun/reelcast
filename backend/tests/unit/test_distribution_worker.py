from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.exceptions import DistributionPublishException
from app.models.models import Distribution, Reel, SocialAccount
from app.worker import _format_caption, _publishDistribution, checkScheduledDistributions


class FormatCaptionTests(unittest.TestCase):
    def test_none_returns_empty_string(self) -> None:
        self.assertEqual("", _format_caption(None))

    def test_joins_caption_and_hashtags(self) -> None:
        result = _format_caption({"caption": "Check this out", "hashtags": ["#reel", "#new"]})
        self.assertEqual("Check this out\n\n#reel #new", result)


class PublishDistributionTaskTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
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

    async def test_missing_distribution_returns_without_error(self) -> None:
        db = self._db_returning(distribution=None)
        with patch("app.worker.SessionLocal", return_value=db):
            await _publishDistribution(str(self.distribution_id))  # should not raise
        db.close.assert_called_once()

    async def test_reel_without_video_marks_failed(self) -> None:
        incomplete_reel = Reel(reel_id=self.reel_id, user_id=self.user_id, status="Generating", prompt_text="x")
        db = self._db_returning(distribution=self.distribution, reel=incomplete_reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "Failed"]
        self.assertEqual(1, len(failed_calls))
        self.assertIn("no finished video", failed_calls[0].kwargs["error_message"])

    async def test_missing_account_marks_failed(self) -> None:
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=None), \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "Failed"]
        self.assertEqual(1, len(failed_calls))
        self.assertIn("Connected account not found", failed_calls[0].kwargs["error_message"])

    async def test_successful_publish_marks_published(self) -> None:
        db = self._db_returning(distribution=self.distribution, reel=self.reel)

        with patch("app.worker.SessionLocal", return_value=db), \
             patch("app.worker.social_account_service.get_social_account", return_value=self.account), \
             patch("app.worker.social_account_service.get_decrypted_access_token", return_value="plain-token"), \
             patch("app.worker.get_presigned_url", return_value="https://cdn.example.com/video.mp4"), \
             patch("app.worker.distribution_publish_service.publish", new=AsyncMock(return_value="tiktok-post-id")), \
             patch("app.worker.distribution_service.update_distribution") as mock_update:
            await _publishDistribution(str(self.distribution_id))

        statuses = [c.kwargs.get("status") for c in mock_update.call_args_list]
        self.assertIn("Uploading", statuses)
        self.assertIn("Published", statuses)
        self.assertNotIn("Failed", statuses)

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


class CheckScheduledDistributionsTests(unittest.TestCase):
    """Celery Beat's periodic task — claims due distributions and queues them."""

    def setUp(self) -> None:
        self.db = MagicMock()

    def test_claims_and_queues_due_distributions(self) -> None:
        due = [
            Distribution(distribution_id=uuid4(), status="Pending"),
            Distribution(distribution_id=uuid4(), status="Pending"),
        ]
        self.db.query.return_value.filter.return_value.all.return_value = due

        with patch("app.worker.SessionLocal", return_value=self.db), \
             patch("app.worker.distribution_service.update_distribution") as mock_update, \
             patch("app.worker.publishDistribution") as mock_task:
            checkScheduledDistributions()

        self.assertEqual(2, mock_update.call_count)
        for call in mock_update.call_args_list:
            self.assertEqual("Uploading", call.kwargs["status"])
        self.assertEqual(2, mock_task.delay.call_count)

    def test_no_due_distributions_queues_nothing(self) -> None:
        self.db.query.return_value.filter.return_value.all.return_value = []

        with patch("app.worker.SessionLocal", return_value=self.db), \
             patch("app.worker.publishDistribution") as mock_task:
            checkScheduledDistributions()

        mock_task.delay.assert_not_called()
        self.db.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
