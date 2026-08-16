from __future__ import annotations

import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routes.tracking_routes import (
    connect_ecommerce_account,
    disconnect_ecommerce_account,
    get_tracking_dashboard,
    ingest_tracking_metric,
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
                disconnect_ecommerce_account(uuid4(), db=self.db, current_user=self.user)
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
            result = get_tracking_dashboard(start=start, end=end, db=self.db, current_user=self.user)
        self.assertEqual({"totals": {}}, result)
        dashboard.assert_called_once_with(self.db, user_id=self.user.user_id, start=start, end=end)

    def test_F5_UTC05_rejects_invalid_date_range(self) -> None:
        with self.assertRaises(HTTPException) as context:
            get_tracking_dashboard(start=date(2026, 8, 17), end=date(2026, 8, 1), db=self.db, current_user=self.user)
        self.assertEqual(422, context.exception.status_code)


if __name__ == "__main__":
    unittest.main()
