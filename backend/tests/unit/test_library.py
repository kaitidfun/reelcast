from __future__ import annotations

import pytest
from tests.pytest_helpers import PytestAssertions

from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from sqlalchemy.exc import SQLAlchemyError

from app.exceptions import (
    CampaignNotFoundException,
    DatabaseInsertException,
    DatabaseRetrieveException,
    DuplicateCampaignNameException,
    InvalidImageFormatException,
    MaxImagesExceededException,
)
from app.models.models import BannerColor, Campaign, Product, ProductImage
from app.routes.library_routes import _product_status, browseLibrary
from app.schemas.product import ProductImageCreate, ProductResponse
from app.services.campaign_service import createCampaign
from app.services.product_service import createProduct


class TestCampaignTests(PytestAssertions):
    """F4-UTC01 campaign creation."""

    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.query = self.db.query.return_value.filter.return_value
        self.query.first.return_value = None
        self.user_id = uuid4()

    def test_F4_UTC01_TC01_creates_campaign(self) -> None:
        campaign = createCampaign(
            self.db,
            userId=self.user_id,
            campaignName=" Summer 2026 ",
            description="Promo",
            coverImage="summer_banner.jpg",
        )

        self.assertEqual("Summer 2026", campaign.name)
        self.assertEqual("summer_banner.jpg", campaign.banner_image_url)
        self.db.add.assert_called_once_with(campaign)
        self.db.commit.assert_called_once()

    def test_F4_UTC01_TC02_rejects_duplicate_name(self) -> None:
        self.query.first.return_value = SimpleNamespace(name="Summer 2026")

        with self.assertRaises(DuplicateCampaignNameException):
            createCampaign(
                self.db,
                userId=self.user_id,
                campaignName="Summer 2026",
            )

    def test_F4_UTC01_TC03_maps_database_insert_failure(self) -> None:
        self.db.commit.side_effect = SQLAlchemyError("insert failed")

        with self.assertRaises(DatabaseInsertException):
            createCampaign(
                self.db,
                userId=self.user_id,
                campaignName="Summer 2026",
            )

        self.db.rollback.assert_called_once()


class TestProductTests(PytestAssertions):
    """F4-UTC02 product creation and image constraints."""

    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.query = self.db.query.return_value.filter.return_value
        self.query.first.return_value = SimpleNamespace(campaign_id=uuid4())
        self.user_id = uuid4()
        self.campaign_id = uuid4()

        def assign_product_id(model) -> None:
            if model.__class__.__name__ == "Product" and model.product_id is None:
                model.product_id = uuid4()

        self.db.add.side_effect = assign_product_id

    def test_F4_UTC02_TC01_creates_product_with_valid_images(self) -> None:
        product = createProduct(
            self.db,
            userId=self.user_id,
            campaignId=self.campaign_id,
            productName="Cold Brew Kit",
            description="Premium cold brew kit",
            affiliateLinks="https://example.com/cold-brew",
            productImages=[
                ProductImageCreate(image_url="photo1.jpg", is_primary=True),
                ProductImageCreate(image_url="photo2.png"),
                ProductImageCreate(image_url="photo3.webp"),
            ],
        )

        self.assertEqual("Cold Brew Kit", product.product_name)
        self.assertEqual(4, self.db.add.call_count)
        self.db.commit.assert_called_once()

    def test_F4_UTC02_TC02_rejects_missing_campaign(self) -> None:
        self.query.first.return_value = None

        with self.assertRaises(CampaignNotFoundException):
            createProduct(
                self.db,
                userId=self.user_id,
                campaignId=self.campaign_id,
                productName="Cold Brew Kit",
            )

    def test_F4_UTC02_TC03_rejects_more_than_five_images(self) -> None:
        images = [
            ProductImageCreate(image_url=f"photo{index}.jpg")
            for index in range(6)
        ]

        with self.assertRaises(MaxImagesExceededException):
            createProduct(
                self.db,
                userId=self.user_id,
                campaignId=self.campaign_id,
                productName="Cold Brew Kit",
                productImages=images,
            )

    def test_F4_UTC02_TC04_rejects_unsupported_image_format(self) -> None:
        with self.assertRaises(InvalidImageFormatException):
            createProduct(
                self.db,
                userId=self.user_id,
                campaignId=self.campaign_id,
                productName="Cold Brew Kit",
                productImages=[
                    ProductImageCreate(image_url="product.pdf"),
                ],
            )

    def test_product_status_is_active_only_when_complete(self) -> None:
        active = SimpleNamespace(
            product_name="Cold Brew Kit",
            description="Description",
            affiliate_link="https://example.com",
            images=[SimpleNamespace(image_url="photo.jpg")],
        )
        draft = SimpleNamespace(
            product_name="",
            description="",
            affiliate_link="",
            images=[],
        )

        self.assertEqual("Active", _product_status(active))
        self.assertEqual("Draft", _product_status(draft))

    @patch(
        "app.services.storage_service.get_presigned_url",
        side_effect=lambda value: value,
    )
    def test_product_response_exposes_draft_status(self, _get_url) -> None:
        response = ProductResponse(
            product_id=uuid4(),
            campaign_id=self.campaign_id,
            user_id=self.user_id,
            product_name="",
            description=None,
            affiliate_link=None,
            images=[],
        )

        self.assertEqual("Draft", response.status)


class TestLibraryBrowseTests(PytestAssertions):
    """F4-UTC03 campaign and product retrieval."""

    def setup_method(self, _method) -> None:
        self.user_id = uuid4()
        self.campaign_id = uuid4()
        self.product_id = uuid4()
        self.campaign = Campaign(
            campaign_id=self.campaign_id,
            user_id=self.user_id,
            name="Summer 2026",
            description="Promo",
            banner_color=BannerColor.Twilight,
            banner_image_url="summer_banner.jpg",
        )
        self.product = Product(
            product_id=self.product_id,
            campaign_id=self.campaign_id,
            user_id=self.user_id,
            product_name="Cold Brew Coffee",
            description="Cold Brew Kit",
            affiliate_link="https://example.com/products/cold-brew",
            images=[
                ProductImage(
                    image_id=uuid4(),
                    product_id=self.product_id,
                    image_url="products/cold-brew.jpg",
                    is_primary=True,
                )
            ],
        )

    @patch(
        "app.services.storage_service.get_presigned_url",
        side_effect=lambda value: value,
    )
    def test_F4_UTC03_TC01_retrieves_by_product_keyword(
        self,
        _get_url,
    ) -> None:
        db = MagicMock()
        campaign_query = MagicMock()
        product_query = MagicMock()
        for method in ("filter", "outerjoin", "distinct", "order_by"):
            getattr(campaign_query, method).return_value = campaign_query
        campaign_query.all.return_value = [self.campaign]
        product_query.options.return_value = product_query
        product_query.filter.return_value = product_query
        product_query.all.return_value = [self.product]
        # Third query shape: the grouped Reel-count lookup added for library
        # reel badges — db.query(Reel.product_id, func.count(...)).filter(...)
        # .group_by(...).all(). Empty result is fine; the test doesn't assert
        # on reel_count, just that this new query doesn't blow up the mock.
        reel_count_query = MagicMock()
        reel_count_query.filter.return_value = reel_count_query
        reel_count_query.group_by.return_value = reel_count_query
        reel_count_query.all.return_value = []
        db.query.side_effect = (
            lambda *args: campaign_query
            if args[0] is Campaign
            else product_query
            if args[0] is Product
            else reel_count_query
        )

        result = browseLibrary(
            searchKeyword="Cold Brew",
            sortOption="Newest",
            viewMode="Grid",
            statusFilter="Active",
            campaignNameFilter=None,
            db=db,
            current_user=SimpleNamespace(user_id=self.user_id),
        )

        self.assertEqual("Summer 2026", result["campaigns"][0].name)
        self.assertEqual(
            "Cold Brew Coffee",
            result["products"][0].product_name,
        )
        self.assertEqual("Active", result["products"][0].status)
        campaign_query.outerjoin.assert_called_once()

    def test_F4_UTC03_TC02_returns_empty_library(self) -> None:
        db = MagicMock()
        campaign_query = MagicMock()
        campaign_query.filter.return_value = campaign_query
        campaign_query.order_by.return_value = campaign_query
        campaign_query.all.return_value = []
        db.query.return_value = campaign_query

        result = browseLibrary(
            searchKeyword=None,
            sortOption="Newest",
            viewMode="Grid",
            statusFilter=None,
            campaignNameFilter=None,
            db=db,
            current_user=SimpleNamespace(user_id=self.user_id),
        )

        self.assertEqual([], result["campaigns"])
        self.assertEqual([], result["products"])
        self.assertEqual(0, result["total"])

    def test_F4_UTC03_TC03_maps_database_failure(self) -> None:
        db = MagicMock()
        db.query.side_effect = SQLAlchemyError("query failed")

        with self.assertRaises(DatabaseRetrieveException):
            browseLibrary(
                searchKeyword="Cold Brew",
                sortOption="Newest",
                viewMode="Grid",
                statusFilter="Active",
                campaignNameFilter=None,
                db=db,
                current_user=SimpleNamespace(user_id=self.user_id),
            )
