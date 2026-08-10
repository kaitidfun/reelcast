from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.exceptions import DistributionNotFoundException
from app.models.models import Distribution, Reel, SocialAccount
from app.routes.distribution_routes import (
    cancel_distribution,
    create_distribution,
    list_distributions,
    publish_now,
)
from app.schemas.distribution import DistributionCreate


class CreateDistributionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.req = DistributionCreate(reel_id=uuid4(), account_id=uuid4())

    def test_missing_reel_raises_404(self) -> None:
        self.db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            create_distribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(404, ctx.exception.status_code)

    def test_incomplete_reel_rejected(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Generating", prompt_text="x")
        self.db.query.return_value.filter.return_value.first.return_value = reel
        with self.assertRaises(HTTPException) as ctx:
            create_distribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(400, ctx.exception.status_code)

    def test_missing_account_raises_404(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Completed", prompt_text="x")
        self.db.query.return_value.filter.return_value.first.side_effect = [reel, None]
        with self.assertRaises(HTTPException) as ctx:
            create_distribution(self.req, db=self.db, current_user=self.user)
        self.assertEqual(404, ctx.exception.status_code)

    def test_creates_distribution_when_reel_and_account_valid(self) -> None:
        reel = Reel(reel_id=self.req.reel_id, user_id=self.user.user_id, status="Completed", prompt_text="x")
        account = SocialAccount(account_id=self.req.account_id, user_id=self.user.user_id, platform_name="tiktok", access_token="enc")
        self.db.query.return_value.filter.return_value.first.side_effect = [reel, account]

        with patch("app.routes.distribution_routes.distribution_service.create_distribution") as mock_create:
            mock_create.return_value = Distribution(
                distribution_id=uuid4(), reel_id=self.req.reel_id, account_id=self.req.account_id, status="Pending"
            )
            result = create_distribution(self.req, db=self.db, current_user=self.user)

        mock_create.assert_called_once_with(
            self.db, reel_id=self.req.reel_id, account_id=self.req.account_id, scheduled_time=None
        )
        self.assertEqual("Pending", result.status)


class ListDistributionsTests(unittest.TestCase):
    def test_filters_to_current_user_only(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(user_id=uuid4())
        chain = db.query.return_value.join.return_value.filter.return_value
        chain.count.return_value = 0
        chain.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []

        result = list_distributions(db=db, current_user=user)
        self.assertEqual(0, result.total)
        self.assertEqual([], result.distributions)


class CancelDistributionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.distribution_id = uuid4()

    def test_missing_distribution_raises_domain_exception(self) -> None:
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(DistributionNotFoundException):
            cancel_distribution(self.distribution_id, db=self.db, current_user=self.user)

    def test_cannot_cancel_while_uploading(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Uploading")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist
        with self.assertRaises(HTTPException) as ctx:
            cancel_distribution(self.distribution_id, db=self.db, current_user=self.user)
        self.assertEqual(409, ctx.exception.status_code)

    def test_deletes_pending_distribution(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Pending")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist
        with patch("app.routes.distribution_routes.distribution_service.delete_distribution") as mock_delete:
            cancel_distribution(self.distribution_id, db=self.db, current_user=self.user)
        mock_delete.assert_called_once_with(self.db, distribution_id=self.distribution_id)


class PublishNowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.distribution_id = uuid4()

    def test_already_published_rejected(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Published")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist
        with self.assertRaises(HTTPException) as ctx:
            publish_now(self.distribution_id, db=self.db, current_user=self.user)
        self.assertEqual(409, ctx.exception.status_code)

    def test_queues_celery_task_for_pending_distribution(self) -> None:
        dist = Distribution(distribution_id=self.distribution_id, status="Pending")
        self.db.query.return_value.join.return_value.filter.return_value.first.return_value = dist

        with patch("app.worker.publishDistribution") as mock_task:
            result = publish_now(self.distribution_id, db=self.db, current_user=self.user)

        mock_task.delay.assert_called_once_with(str(self.distribution_id))
        self.assertEqual(dist, result)


if __name__ == "__main__":
    unittest.main()
