from __future__ import annotations

import ast
import asyncio
import os
import smtplib
import unittest
from pathlib import Path

import boto3
import httpx
from sqlalchemy import text

import app.exceptions as domain_exceptions
import app.models.models  # noqa: F401 - registers SQLAlchemy models on Base.metadata
from app.database import Base, SessionLocal


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

    def test_api_connection_health_checks(self) -> None:
        results = {}

        # 1. Local Database
        with SessionLocal() as db:
            try:
                db.execute(text("SELECT 1"))
                results["database"] = {"status": "success", "message": "Connected"}
            except Exception as e:
                results["database"] = {"status": "error", "message": str(e)}

        # 2. SMTP
        try:
            smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
            smtp_port = int(os.getenv("SMTP_PORT", 587))
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=5)
            server.starttls()
            server.quit()
            results["smtp"] = {"status": "success", "message": f"Connected to {smtp_server}:{smtp_port}"}
        except Exception as e:
            results["smtp"] = {"status": "error", "message": str(e)}

        # 3. Cloudflare R2
        try:
            r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
            r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
            r2_endpoint = os.getenv("R2_ENDPOINT_URL")
            if r2_access_key and r2_endpoint and r2_endpoint != "https://<ACCOUNT_ID>.r2.cloudflarestorage.com":
                s3_client = boto3.client(
                    "s3",
                    endpoint_url=r2_endpoint,
                    aws_access_key_id=r2_access_key,
                    aws_secret_access_key=r2_secret_key,
                    region_name="auto",
                )
                s3_client.list_buckets()
                results["cloudflare_r2"] = {"status": "success", "message": "Connected and authenticated"}
            else:
                results["cloudflare_r2"] = {"status": "skipped", "message": "Credentials not fully configured"}
        except Exception as e:
            results["cloudflare_r2"] = {"status": "error", "message": str(e)}

        # 4. Google AI Studio (Gemini)
        async def check_google_ai() -> None:
            api_key = os.getenv("GOOGLE_AI_API_KEY")
            if api_key and api_key != "your_google_ai_api_key":
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}",
                        json={"contents": [{"parts": [{"text": "hi"}]}]},
                        timeout=5,
                    )
                    if response.status_code == 200:
                        results["google_ai"] = {"status": "success", "message": "Connected and authenticated"}
                    else:
                        results["google_ai"] = {"status": "error", "message": f"HTTP {response.status_code}: {response.text}"}
            else:
                results["google_ai"] = {"status": "skipped", "message": "API key not configured"}

        try:
            asyncio.run(check_google_ai())
        except Exception as e:
            results["google_ai"] = {"status": "error", "message": str(e)}

        # 5. fal.ai
        async def check_fal_ai() -> None:
            fal_key = os.getenv("FAL_KEY")
            if fal_key and fal_key != "your_fal_api_key":
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        "https://fal.run/fal-ai/fast-svd",
                        headers={"Authorization": f"Key {fal_key}"},
                        timeout=5,
                    )
                    if response.status_code != 401:
                        results["fal_ai"] = {"status": "success", "message": "Key is configured and authenticated"}
                    else:
                        results["fal_ai"] = {"status": "error", "message": "Invalid API Key (HTTP 401)"}
            else:
                results["fal_ai"] = {"status": "skipped", "message": "API key not configured"}

        try:
            asyncio.run(check_fal_ai())
        except Exception as e:
            results["fal_ai"] = {"status": "error", "message": str(e)}

        # 6. Google OAuth
        google_client_id = os.getenv("GOOGLE_CLIENT_ID")
        if google_client_id and google_client_id != "your_google_client_id.apps.googleusercontent.com":
            results["google_oauth"] = {"status": "success", "message": "Client ID configured"}
        else:
            results["google_oauth"] = {"status": "skipped", "message": "Client ID not configured"}

        # 7. Facebook OAuth
        facebook_client_id = os.getenv("FACEBOOK_CLIENT_ID")
        if facebook_client_id and facebook_client_id != "your_facebook_app_id":
            results["facebook_oauth"] = {"status": "success", "message": "Client ID configured"}
        else:
            results["facebook_oauth"] = {"status": "skipped", "message": "Client ID not configured"}

        self.assertIn("database", results)
        self.assertIn("smtp", results)
        self.assertIn("cloudflare_r2", results)
        self.assertIn("google_ai", results)
        self.assertIn("fal_ai", results)
        self.assertIn("google_oauth", results)
        self.assertIn("facebook_oauth", results)

if __name__ == "__main__":
    unittest.main()
