from __future__ import annotations

import ast
import unittest
from pathlib import Path

import app.exceptions as domain_exceptions
import app.models.models  # noqa: F401 - registers SQLAlchemy models on Base.metadata
from app.database import Base


BACKEND_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = BACKEND_ROOT / "app"

DOCUMENT_METHODS = {
    "registerGuest",
    "authenticateMember",
    "updateAccountProfile",
    "manage2FA",
    "inputPromptAndSelectProduct",
    "generateReels",
    "generateCaptionsAndHashtags",
    "uploadOwnReel",
    "overlayImagesAndLogos",
    "previewAndApproveContent",
    "regenerateContent",
    "createCampaign",
    "createProduct",
    "browseLibrary",
}

DOCUMENT_EXCEPTIONS = {
    "EmailAlreadyExistsException",
    "WeakPasswordException",
    "InvalidEmailFormatException",
    "InvalidCredentialsException",
    "AccountNotVerifiedException",
    "OAuthProviderException",
    "InvalidImageFormatException",
    "FileSizeLimitExceededException",
    "DatabaseUpdateException",
    "UnsupportedVideoFormatException",
    "VideoSizeLimitExceededException",
    "InvalidPromptLengthException",
    "ProductNotFoundException",
    "GeminiAPIException",
    "LTXVideoAPIException",
    "GenerationTimeoutException",
    "ContentModerationException",
    "FFmpegProcessingException",
    "InvalidCoordinateException",
    "MediaNotFoundException",
    "RateLimitExceededException",
    "PromptValidationException",
    "DuplicateCampaignNameException",
    "DatabaseInsertException",
    "CampaignNotFoundException",
    "MaxImagesExceededException",
    "DatabaseRetrieveException",
}

DOCUMENT_DB_SCHEMA = {
    "analytics": {
        "columns": {
            "analytics_id",
            "distribution_id",
            "product_id",
            "source_platform",
            "views",
            "clicks",
            "orders",
            "record_date",
            "created_at",
            "updated_at",
        },
        "primary_keys": {"analytics_id"},
        "foreign_keys": {
            "distribution_id": "distributions.distribution_id",
            "product_id": "products.product_id",
        },
    },
    "campaigns": {
        "columns": {
            "campaign_id",
            "user_id",
            "name",
            "description",
            "banner_color",
            "banner_image_url",
            "created_at",
            "updated_at",
            "deleted_at",
        },
        "primary_keys": {"campaign_id"},
        "foreign_keys": {"user_id": "users.user_id"},
    },
    "distributions": {
        "columns": {
            "distribution_id",
            "reel_id",
            "account_id",
            "scheduled_time",
            "status",
            "error_message",
            "retry_count",
            "created_at",
        },
        "primary_keys": {"distribution_id"},
        "foreign_keys": {
            "reel_id": "reels.reel_id",
            "account_id": "social_accounts.account_id",
        },
    },
    "product_images": {
        "columns": {
            "image_id",
            "product_id",
            "image_url",
            "is_primary",
            "created_at",
        },
        "primary_keys": {"image_id"},
        "foreign_keys": {"product_id": "products.product_id"},
    },
    "products": {
        "columns": {
            "product_id",
            "campaign_id",
            "user_id",
            "product_name",
            "description",
            "affiliate_link",
            "brand_logo_url",
            "created_at",
            "updated_at",
            "deleted_at",
        },
        "primary_keys": {"product_id"},
        "foreign_keys": {
            "campaign_id": "campaigns.campaign_id",
            "user_id": "users.user_id",
        },
    },
    "reels": {
        "columns": {
            "reel_id",
            "user_id",
            "product_id",
            "prompt_text",
            "caption_and_hashtags",
            "uploaded_video_url",
            "b_roll_url",
            "raw_video_url",
            "first_frame_url",
            "final_commercial_video_url",
            "status",
            "error_message",
            "retry_count",
            "created_at",
            "deleted_at",
        },
        "primary_keys": {"reel_id"},
        "foreign_keys": {
            "user_id": "users.user_id",
            "product_id": "products.product_id",
        },
    },
    "social_accounts": {
        "columns": {
            "account_id",
            "user_id",
            "platform_name",
            "access_token",
            "refresh_token",
            "created_at",
        },
        "primary_keys": {"account_id"},
        "foreign_keys": {"user_id": "users.user_id"},
    },
    "users": {
        "columns": {
            "user_id",
            "email",
            "display_name",
            "hashed_password",
            "is_email_verified",
            "is_2fa_enabled",
            "two_factor_secret",
            "profile_image",
            "created_at",
            "updated_at",
        },
        "primary_keys": {"user_id"},
        "foreign_keys": {},
    },
}


class DocumentAlignmentTests(unittest.TestCase):
    def test_all_document_methods_exist(self) -> None:
        function_names: set[str] = set()
        for path in APP_ROOT.rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            function_names.update(
                node.name
                for node in ast.walk(tree)
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            )

        self.assertEqual(set(), DOCUMENT_METHODS - function_names)

    def test_all_document_exceptions_exist(self) -> None:
        exported = set(domain_exceptions.__all__)
        self.assertEqual(set(), DOCUMENT_EXCEPTIONS - exported)

        for exception_name in DOCUMENT_EXCEPTIONS:
            exception_type = getattr(domain_exceptions, exception_name)
            self.assertTrue(
                issubclass(exception_type, domain_exceptions.ReelCastException)
            )

    def test_database_schema_matches_document(self) -> None:
        self.assertEqual(set(DOCUMENT_DB_SCHEMA), set(Base.metadata.tables))

        for table_name, expected in DOCUMENT_DB_SCHEMA.items():
            with self.subTest(table=table_name):
                table = Base.metadata.tables[table_name]
                self.assertEqual(expected["columns"], set(table.columns.keys()))

                primary_keys = {
                    column.name
                    for column in table.columns
                    if column.primary_key
                }
                self.assertEqual(expected["primary_keys"], primary_keys)

                foreign_keys = {
                    column.name: next(iter(column.foreign_keys)).target_fullname
                    for column in table.columns
                    if column.foreign_keys
                }
                self.assertEqual(expected["foreign_keys"], foreign_keys)

if __name__ == "__main__":
    unittest.main()
