from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.services import tracking_provider_service, tracking_service


class TrackingDashboardMetricTests(unittest.TestCase):
    def test_dashboard_uses_redirect_records_for_outbound_clicks(self) -> None:
        campaign = SimpleNamespace(campaign_id=uuid4(), name="Launch")
        product = SimpleNamespace(product_id=uuid4(), product_name="Lamp", campaign=campaign)
        reel = SimpleNamespace(reel_id=uuid4(), prompt_text="Lamp reel")
        analytics = SimpleNamespace(
            product=product, distribution=SimpleNamespace(reel=reel),
            record_date=date(2026, 8, 25), source_platform="youtube",
            views=20, engagement=4, orders=0, revenue=0, clicks=999,
        )
        click = SimpleNamespace(clicked_at=datetime(2026, 8, 25, 12, tzinfo=timezone.utc))
        link = SimpleNamespace(platform="youtube")
        query = MagicMock()
        query.all.return_value = [analytics]
        click_query = MagicMock()
        click_query.all.return_value = [(click, link, product, reel)]

        with patch("app.services.tracking_service._member_metrics_query", return_value=query), \
             patch("app.services.tracking_service._member_outbound_click_query", return_value=click_query), \
             patch("app.services.tracking_service._apply_tracking_filters", return_value=query), \
             patch("app.services.tracking_service._apply_outbound_click_filters", return_value=click_query):
            result = tracking_service._build_tracking_breakdown(
                MagicMock(), user_id=uuid4(),
                filters={"start": None, "end": None, "platform": None, "campaign_id": None, "product_id": None},
            )

        self.assertEqual(20, result["totals"]["views"])
        self.assertEqual(4, result["totals"]["engagement"])
        self.assertEqual(1, result["totals"]["clicks"])
        self.assertEqual(5.0, result["totals"]["click_through_rate"])
        self.assertEqual(1, result["reels"][0]["clicks"])

    def test_social_sync_maps_provider_post_id_to_distribution(self) -> None:
        distribution = SimpleNamespace(
            distribution_id=uuid4(), reel=SimpleNamespace(product_id=uuid4()),
        )
        metric = {"external_ref": "youtube:video-42", "record_date": "2026-08-25", "views": 8}
        with patch(
            "app.services.tracking_provider_service._distribution_for_social_metric",
            return_value=distribution,
        ):
            payload = tracking_provider_service._metric_payload(
                metric, "youtube", db=MagicMock(), user_id=uuid4(),
            )

        self.assertEqual(distribution.distribution_id, payload["distribution_id"])
        self.assertEqual(distribution.reel.product_id, payload["product_id"])


if __name__ == "__main__":
    unittest.main()
