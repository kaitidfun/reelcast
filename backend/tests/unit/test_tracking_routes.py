from __future__ import annotations

import unittest
import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routes.tracking_routes import (
    connect_ecommerce_account,
    disconnectEcommerceAccount,
    getTrackingDashboard,
    ingest_tracking_metric,
    synchronizeTrackingData,
    connectEcommerceAccount,
    ecommerceAccountCallback,
)
from app.schemas.analytics import EcommerceAccountConnect, TrackingMetricCreate


class TrackingRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())

    def test_F5_UTC01_connects_a_member_shop_with_provider_token(self) -> None:
        request = EcommerceAccountConnect(
            platform_name="shopee", external_shop_id="shop-42", access_token="oauth-token",
        )
        expected = SimpleNamespace(platform_name="shopee")
        with patch("app.routes.tracking_routes.tracking_service.upsert_ecommerce_account", return_value=expected) as create:
            result = connect_ecommerce_account(request, db=self.db, current_user=self.user)

        self.assertIs(expected, result)
        create.assert_called_once_with(
            self.db, user_id=self.user.user_id, platform_name="shopee", external_shop_id="shop-42",
            access_token="oauth-token", refresh_token=None, shop_name=None,
        )

    def test_F5_UTC02_cannot_disconnect_another_members_shop(self) -> None:
        with patch("app.routes.tracking_routes.tracking_service.delete_ecommerce_account", return_value=False):
            with self.assertRaises(HTTPException) as context:
                disconnectEcommerceAccount(uuid4(), db=self.db, current_user=self.user)
        self.assertEqual(404, context.exception.status_code)

    def test_F5_UTC03_records_only_owned_tracking_metric(self) -> None:
        request = TrackingMetricCreate(source_platform="tiktok_shop", record_date=date(2026, 8, 17), orders=3)
        with patch("app.routes.tracking_routes.tracking_service.record_metric", return_value={"orders": 3}) as record:
            result = ingest_tracking_metric(request, db=self.db, current_user=self.user)
        self.assertEqual({"orders": 3}, result)
        self.assertEqual(self.user.user_id, record.call_args.kwargs["user_id"])

    def test_F5_UTC03_rejects_metric_for_unknown_owned_resource(self) -> None:
        request = TrackingMetricCreate(source_platform="lazada", record_date=date(2026, 8, 17), product_id=uuid4())
        with patch("app.routes.tracking_routes.tracking_service.record_metric", side_effect=LookupError("Product not found")):
            with self.assertRaises(HTTPException) as context:
                ingest_tracking_metric(request, db=self.db, current_user=self.user)
        self.assertEqual(404, context.exception.status_code)

    def test_F5_UTC05_dashboard_delegates_with_date_filters(self) -> None:
        start, end = date(2026, 8, 1), date(2026, 8, 17)
        with patch("app.routes.tracking_routes.tracking_service.dashboard", return_value={"totals": {}}) as dashboard:
            result = getTrackingDashboard(start=start, end=end, db=self.db, current_user=self.user)
        self.assertEqual({"totals": {}}, result)
        dashboard.assert_called_once_with(self.db, user_id=self.user.user_id, start=start, end=end)

    def test_F5_UTC05_rejects_invalid_date_range(self) -> None:
        with self.assertRaises(HTTPException) as context:
            getTrackingDashboard(start=date(2026, 8, 17), end=date(2026, 8, 1), db=self.db, current_user=self.user)
        self.assertEqual(422, context.exception.status_code)

    def test_F5_UTC03_runs_the_configured_provider_sync(self) -> None:
        expected = {"ecommerce_metrics": 2, "social_metrics": 3}
        with patch(
            "app.routes.tracking_routes.tracking_provider_service.sync_member",
            new=AsyncMock(return_value=expected),
        ) as sync:
            result = asyncio.run(synchronizeTrackingData(db=self.db, current_user=self.user))
        self.assertEqual(expected, result)
        sync.assert_awaited_once_with(self.db, user_id=self.user.user_id)

    def test_F5_UTC01_starts_shop_oauth_without_exposing_provider_token(self) -> None:
        request = SimpleNamespace(session={})
        self.db.query.return_value.filter.return_value.first.return_value = self.user
        with patch("app.routes.tracking_routes.jwt.decode", return_value={"sub": "member@example.com"}), \
             patch("app.routes.tracking_routes.tracking_provider_service.build_authorize_url", return_value="https://provider.example/consent"):
            response = connectEcommerceAccount("shopee", request, token="member-jwt", db=self.db)
        self.assertEqual("https://provider.example/consent", response.headers["location"])
        self.assertNotIn("member-jwt", response.headers["location"])
        self.assertEqual("shopee", request.session["reelcast_shop_connect_platform"])

    def test_F5_UTC01_callback_saves_encrypted_shop_credentials_server_side(self) -> None:
        user_id = uuid4()
        request = SimpleNamespace(session={
            "reelcast_shop_connect_state": "state-1",
            "reelcast_shop_connect_platform": "lazada",
            "reelcast_shop_connect_user_id": str(user_id),
        })
        tokens = {
            "access_token": "provider-token", "refresh_token": None,
            "external_shop_id": "shop-99", "shop_name": "Demo Shop",
        }
        with patch("app.routes.tracking_routes.tracking_provider_service.exchange_authorization_code", new=AsyncMock(return_value=tokens)), \
             patch("app.routes.tracking_routes.tracking_service.upsert_ecommerce_account") as save:
            response = asyncio.run(ecommerceAccountCallback("lazada", request, code="code-1", state="state-1", db=self.db))
        self.assertIn("connected=lazada", response.headers["location"])
        self.assertEqual("provider-token", save.call_args.kwargs["access_token"])
        self.assertEqual(user_id, save.call_args.kwargs["user_id"])


if __name__ == "__main__":
    unittest.main()
