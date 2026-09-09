from __future__ import annotations

import pytest
from tests.pytest_helpers import PytestAssertions

from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.exceptions import DistributionNotFoundException
from app.models.models import Distribution, Reel, SocialAccount
from app.routes.distribution_routes import (
    cancelDistribution,
    createDistribution,
    listDistributions,
    listDistributionsByReel,
    publishNow,
    rescheduleDistribution,
)
from app.schemas.distribution import DistributionCreate, DistributionReschedule


# UTC: F3-UTC04, F3-UTC05, F3-UTC06, F3-UTC08, F3-UTC10
# STC: STC-F3-02, STC-F3-03
class TestCreateDistributionTests(PytestAssertions):
    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.req = DistributionCreate(reel_id=uuid4(), account_id=uuid4())

    def test_missing_reel_raises_404(self) -> None:
        self.db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            createDistribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(404, ctx.exception.status_code)

    def test_incomplete_reel_rejected(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Generating", prompt_text="x")
        self.db.query.return_value.filter.return_value.first.return_value = reel
        with self.assertRaises(HTTPException) as ctx:
            createDistribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(400, ctx.exception.status_code)

    def test_unsaved_reel_rejected(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Completed", prompt_text="x", is_saved=False)
        self.db.query.return_value.filter.return_value.first.return_value = reel
        with self.assertRaises(HTTPException) as ctx:
            createDistribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(400, ctx.exception.status_code)

    def test_missing_account_raises_404(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Completed", prompt_text="x", is_saved=True)
        self.db.query.return_value.filter.return_value.first.side_effect = [reel, None]
        with self.assertRaises(HTTPException) as ctx:
            createDistribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(404, ctx.exception.status_code)

    def test_creates_distribution_when_reel_and_account_valid(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Completed", prompt_text="x", is_saved=True)
        account = SocialAccount(account_id=self.req.account_id, user_id=self.user.user_id, platform_name="tiktok", access_token="enc")
        self.db.query.return_value.filter.return_value.first.side_effect = [reel, account]

        with patch("app.routes.distribution_routes.distribution_service.create_distribution") as mock_create:
            mock_create.return_value = Distribution(
                distribution_id=uuid4(), reel_id=self.req.reel_id, account_id=self.req.account_id, status="Pending"
            )
            result = createDistribution(self.req, db=self.db, current_user=self.user)

        mock_create.assert_called_once_with(
            self.db, reel_id=self.req.reel_id, account_id=self.req.account_id, scheduled_time=None
        )
        self.assertEqual("Pending", result.status)


class TestListDistributionsTests(PytestAssertions):
    def test_filters_to_current_user_only(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(user_id=uuid4())
        chain = db.query.return_value.join.return_value.filter.return_value
        chain.count.return_value = 0
        chain.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []

        result = listDistributions(db=db, current_user=user)
        self.assertEqual(0, result.total)
        self.assertEqual([], result.distributions)
        db.query.return_value.join.assert_called_once()

    def test_searches_reel_platform_and_status_names(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(user_id=uuid4())
        owned_query = db.query.return_value.join.return_value.filter.return_value
        searched_query = owned_query.filter.return_value
        searched_query.count.return_value = 0
        searched_query.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []

        result = listDistributions(search="published", db=db, current_user=user)

        owned_query.filter.assert_called_once()
        self.assertEqual(0, result.total)
        self.assertEqual([], result.distributions)


class TestListDistributionsByReelTests(PytestAssertions):
    def test_no_matches_returns_empty_groups(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(user_id=uuid4())
        chain = db.query.return_value.join.return_value.filter.return_value.group_by.return_value
        chain.count.return_value = 0
        chain.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []

        result = listDistributionsByReel(db=db, current_user=user)
        self.assertEqual(0, result.total)
        self.assertEqual([], result.reels)

    def test_groups_multiple_platforms_under_one_reel(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(user_id=uuid4())
        reel_id = uuid4()

        matches_chain = db.query.return_value.join.return_value.filter.return_value.group_by.return_value
        matches_chain.count.return_value = 1
        matched_row = SimpleNamespace(
            reel_id=reel_id, name="patrick bag", saved_prompt_text="a patrick bag", last_match_at=None
        )
        matches_chain.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [matched_row]

        yt_dist = Distribution(
            distribution_id=uuid4(), reel_id=reel_id, account_id=uuid4(), status="Published", created_at=None,
            retry_count=0,
        )
        ig_dist = Distribution(
            distribution_id=uuid4(), reel_id=reel_id, account_id=uuid4(), status="Failed", created_at=None,
            retry_count=0,
        )
        all_items_chain = db.query.return_value.filter.return_value.order_by.return_value
        all_items_chain.all.return_value = [yt_dist, ig_dist]

        # _attach_display_fields' own two grouped lookups — empty is fine,
        # this test only cares that both distributions land under one group.
        db.query.return_value.filter.return_value.all.return_value = []

        result = listDistributionsByReel(db=db, current_user=user)

        self.assertEqual(1, result.total)
        self.assertEqual(1, len(result.reels))
        group = result.reels[0]
        self.assertEqual(reel_id, group.reel_id)
        self.assertEqual(2, len(group.platforms))
        self.assertEqual({"Published", "Failed"}, {p.status for p in group.platforms})


class TestCancelDistributionTests(PytestAssertions):
    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.distribution_id = uuid4()

    def test_missing_distribution_raises_domain_exception(self) -> None:
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(DistributionNotFoundException):
            cancelDistribution(self.distribution_id, db=self.db, current_user=self.user)

    def test_cannot_cancel_while_uploading(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Uploading")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist
        with self.assertRaises(HTTPException) as ctx:
            cancelDistribution(self.distribution_id, db=self.db, current_user=self.user)
        self.assertEqual(409, ctx.exception.status_code)

    def test_deletes_pending_distribution(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Pending")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist
        with patch("app.routes.distribution_routes.distribution_service.delete_distribution") as mock_delete:
            cancelDistribution(self.distribution_id, db=self.db, current_user=self.user)
        mock_delete.assert_called_once_with(self.db, distribution_id=self.distribution_id)


class TestPublishNowTests(PytestAssertions):
    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.distribution_id = uuid4()

    def test_already_published_rejected(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Published")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist
        with self.assertRaises(HTTPException) as ctx:
            publishNow(self.distribution_id, db=self.db, current_user=self.user)
        self.assertEqual(409, ctx.exception.status_code)


    def test_queues_celery_task_for_pending_distribution(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Pending")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist

        with patch("app.routes.distribution_routes.distribution_service.claim_distribution_for_publish", return_value=True) as mock_claim, \
             patch("app.worker.publishDistribution") as mock_task:
            result = publishNow(self.distribution_id, db=self.db, current_user=self.user)

        mock_claim.assert_called_once_with(
            self.db, distribution_id=self.distribution_id, allowed_statuses=("Pending", "Failed")
        )
        mock_task.delay.assert_called_once_with(str(self.distribution_id))
        self.assertEqual(dist, result)

    def test_publish_now_rejects_if_another_request_claimed_it_first(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Pending")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist

        with patch("app.routes.distribution_routes.distribution_service.claim_distribution_for_publish", return_value=False), \
             self.assertRaises(HTTPException) as ctx:
            publishNow(self.distribution_id, db=self.db, current_user=self.user)

        self.assertEqual(409, ctx.exception.status_code)


class TestRescheduleDistributionTests(PytestAssertions):
    """F3-UTC10: only owned Pending/Failed distributions may be rescheduled."""

    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.distribution_id = uuid4()
        self.req = DistributionReschedule(scheduled_time="2026-09-22T09:00:00Z")

    def test_F3_UTC10_reschedules_pending_and_preserves_its_status(self) -> None:
        distribution = Distribution(distribution_id=self.distribution_id, status="Pending", retry_count=0)
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = distribution

        with patch("app.routes.distribution_routes.distribution_service.update_distribution", return_value=distribution) as update:
            result = rescheduleDistribution(self.distribution_id, self.req, db=self.db, current_user=self.user)

        update.assert_called_once_with(self.db, distribution=distribution, scheduled_time=self.req.scheduled_time)
        self.assertEqual("Pending", result.status)

    def test_F3_UTC10_rejects_uploading_distribution_without_mutating_it(self) -> None:
        distribution = Distribution(distribution_id=self.distribution_id, status="Uploading")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = distribution

        with self.assertRaises(HTTPException) as ctx:
            rescheduleDistribution(self.distribution_id, self.req, db=self.db, current_user=self.user)

        self.assertEqual(409, ctx.exception.status_code)

    def test_F3_UTC10_rejects_an_unowned_distribution(self) -> None:
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(DistributionNotFoundException):
            rescheduleDistribution(self.distribution_id, self.req, db=self.db, current_user=self.user)
