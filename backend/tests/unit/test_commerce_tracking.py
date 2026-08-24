from __future__ import annotations

import hashlib
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from starlette.requests import Request

from app.models.models import AttributionLink, Distribution, Product, Reel
from app.routes.redirect_routes import redirect_outbound_link
from app.schemas.product import ProductCreate
from app.services import attribution_service, outbound_tracking_service


def _request(*, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/r/token",
        "headers": headers or [],
        "client": ("203.0.113.42", 5555),
        "scheme": "http",
        "server": ("testserver", 80),
    })


class ProductAffiliateLinkValidationTests(unittest.TestCase):
    def test_accepts_optional_https_affiliate_link(self) -> None:
        product = ProductCreate(
            campaign_id=uuid4(), product_name="Lamp",
            affiliate_link=" https://s.lazada.co.th/example ",
        )
        self.assertEqual("https://s.lazada.co.th/example", product.affiliate_link)

    def test_rejects_non_https_affiliate_link(self) -> None:
        with self.assertRaises(ValueError):
            ProductCreate(campaign_id=uuid4(), product_name="Lamp", affiliate_link="http://example.test")


class AttributionLinkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.product = Product(product_id=uuid4(), product_name="Lamp", affiliate_link="https://s.lazada.co.th/example")
        self.reel = Reel(reel_id=uuid4(), product_id=self.product.product_id, prompt_text="a reel")
        self.distribution = Distribution(distribution_id=uuid4(), reel_id=self.reel.reel_id)
        self.db = MagicMock()
        self.db.query.return_value.filter.return_value.first.return_value = None

    def test_creates_unique_distribution_attribution_link(self) -> None:
        link = attribution_service.get_or_create_distribution_link(
            self.db,
            product=self.product,
            reel=self.reel,
            distribution=self.distribution,
            platform="youtube",
        )

        self.assertEqual(self.product.product_id, link.product_id)
        self.assertEqual(self.reel.reel_id, link.reel_id)
        self.assertEqual(self.distribution.distribution_id, link.distribution_id)
        self.assertEqual("youtube", link.platform)
        self.assertEqual("lazada", link.affiliate_network)
        self.assertEqual("direct_link", link.route_type)
        self.assertTrue(link.token)
        self.assertTrue(link.sub_id.startswith("rc_youtube_"))
        self.db.add.assert_called_once_with(link)
        self.db.commit.assert_called_once()

    def test_places_tracked_url_before_caption_without_mutating_reel_caption(self) -> None:
        caption = "A great lamp\n\n#home"
        final_caption = attribution_service.append_tracked_url(
            caption, "https://go.example/r/opaque-token"
        )
        self.assertEqual(
            "🛒 Shop here:\nhttps://go.example/r/opaque-token\n\nA great lamp\n\n#home",
            final_caption,
        )
        self.assertEqual("A great lamp\n\n#home", caption)

    def test_tiktok_caption_reserves_space_for_complete_tracked_url(self) -> None:
        url = "https://go.example/r/opaque-token"
        final_caption = attribution_service.append_tracked_url(
            "x" * 200,
            url,
            max_length=attribution_service.platform_caption_limit("tiktok"),
        )
        self.assertLessEqual(len(final_caption), 150)
        self.assertTrue(final_caption.startswith(f"🛒 Shop here:\n{url}"))

class OutboundRedirectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.link = AttributionLink(
            attribution_link_id=uuid4(),
            product_id=uuid4(),
            reel_id=uuid4(),
            distribution_id=uuid4(),
            platform="facebook",
            affiliate_url="https://s.lazada.co.th/example",
            sub_id="rc_fb_example",
            token="opaque-token",
        )
        self.db = MagicMock()

    def test_valid_token_records_outbound_click_and_returns_302(self) -> None:
        request = _request(headers=[(b"referer", b"https://facebook.com/post"), (b"user-agent", b"test-agent")])
        with patch("app.routes.redirect_routes.outbound_tracking_service.get_by_token", return_value=self.link) as mock_get, \
             patch("app.routes.redirect_routes.outbound_tracking_service.record_outbound_click") as mock_record:
            response = redirect_outbound_link("opaque-token", request, db=self.db)

        mock_get.assert_called_once_with(self.db, "opaque-token")
        mock_record.assert_called_once_with(self.db, link=self.link, request=request)
        self.assertEqual(302, response.status_code)
        self.assertEqual("https://s.lazada.co.th/example", response.headers["location"])

    def test_invalid_token_returns_normal_404(self) -> None:
        with patch("app.routes.redirect_routes.outbound_tracking_service.get_by_token", return_value=None), \
             self.assertRaises(HTTPException) as context:
            redirect_outbound_link("missing", _request(), db=self.db)
        self.assertEqual(404, context.exception.status_code)

    def test_tracking_failure_still_redirects(self) -> None:
        with patch("app.routes.redirect_routes.outbound_tracking_service.get_by_token", return_value=self.link), \
             patch("app.routes.redirect_routes.outbound_tracking_service.record_outbound_click", side_effect=RuntimeError("db down")):
            response = redirect_outbound_link("opaque-token", _request(), db=self.db)
        self.db.rollback.assert_called_once()
        self.assertEqual(302, response.status_code)
        self.assertEqual("https://s.lazada.co.th/example", response.headers["location"])

    def test_click_record_uses_hash_not_raw_ip(self) -> None:
        request = _request(headers=[(b"referer", b"https://instagram.com/reel"), (b"user-agent", b"browser")])
        with patch("app.services.outbound_tracking_service.TRACKING_HASH_SECRET", "test-salt"):
            click = outbound_tracking_service.record_outbound_click(self.db, link=self.link, request=request)

        expected = hashlib.sha256(b"203.0.113.42test-salt").hexdigest()
        self.assertEqual(expected, click.ip_hash)
        self.assertEqual("https://instagram.com/reel", click.referrer)
        self.assertEqual("browser", click.user_agent)
        self.assertNotEqual("203.0.113.42", click.ip_hash)


if __name__ == "__main__":
    unittest.main()
