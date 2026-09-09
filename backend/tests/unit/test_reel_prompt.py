from __future__ import annotations

# UTC: F2-UTC01, F2-UTC02, F2-UTC03, F2-UTC06, F2-UTC07, F2-UTC08, F2-UTC09, F2-UTC10
# STC: STC-F2-01, STC-F2-02, STC-F2-05

import pytest
from tests.pytest_helpers import PytestAssertions

import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.exceptions import (
    GeminiAPIException,
    GenerationTimeoutException,
    InvalidPromptException,
    InvalidPromptLengthException,
    LTXVideoAPIException,
    MediaNotFoundException,
    ProductNotFoundException,
    RateLimitExceededException,
)
from app.routes.reel_routes import (
    EnhancePromptRequest,
    GuidedPromptRequest,
    PreviewDecisionRequest,
    PromptFromTemplateRequest,
    ReelGenerateRequest,
    ReelRegenerateRequest,
    enhance_prompt_endpoint,
    generate_guided_prompt_endpoint,
    generate_prompt_endpoint,
    inputPromptAndSelectProduct,
    previewAndApproveContent,
    regenerateContent,
)
from app.services import ai_service
from app.services.video_generation_service import generate_with_ltx
from app.worker import _build_caption_prompt


class TestReelGenerationTests(PytestAssertions):
    """F2-UTC01, F2-UTC06 and F2-UTC07 route behavior."""

    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.product_id = uuid4()
        self.product_query = self.db.query.return_value.filter.return_value
        self.product_query.first.return_value = SimpleNamespace(
            product_id=self.product_id,
        )

    @patch("app.routes.reel_routes.generateReels.delay")
    @patch("app.routes.reel_routes.create_reel")
    def test_F2_UTC01_TC01_creates_generation_payload(
        self,
        create_reel,
        queue_generation,
    ) -> None:
        reel = SimpleNamespace(
            reel_id=uuid4(),
            status="Pending",
            prompt_text="A cinematic cold brew video",
        )
        create_reel.return_value = reel

        result = inputPromptAndSelectProduct(
            ReelGenerateRequest(
                prompt_text="  A cinematic cold brew video  ",
                product_id=self.product_id,
            ),
            self.db,
            self.user,
        )

        self.assertIs(reel, result)
        create_reel.assert_called_once()
        self.assertEqual(
            "A cinematic cold brew video",
            create_reel.call_args.kwargs["prompt_text"],
        )
        queue_generation.assert_called_once()

    def test_F2_UTC01_TC02_rejects_prompt_over_500_characters(self) -> None:
        request = ReelGenerateRequest.model_construct(
            prompt_text="x" * 501,
            product_id=self.product_id,
            platform="ig",
            overlay_position="bottom-right",
            duration=10,
            with_audio=False,
        )

        with self.assertRaises(InvalidPromptLengthException):
            inputPromptAndSelectProduct(request, self.db, self.user)

    def test_F2_UTC01_TC03_rejects_missing_product(self) -> None:
        self.product_query.first.return_value = None

        with self.assertRaises(ProductNotFoundException):
            inputPromptAndSelectProduct(
                ReelGenerateRequest(
                    prompt_text="A cinematic cold brew video",
                    product_id=self.product_id,
                ),
                self.db,
                self.user,
            )

    @patch("app.routes.reel_routes.get_reel")
    def test_F2_UTC06_TC01_approves_content(self, get_reel) -> None:
        get_reel.return_value = SimpleNamespace(
            reel_id=uuid4(),
            prompt_text="a reel",
            name=None,
            final_commercial_video_url="video.mp4",
            raw_video_url=None,
            uploaded_video_url=None,
            first_frame_url=None,
            caption_and_hashtags={"caption": "Buy now", "hashtags": ["#sale"]},
            is_saved=False,
        )

        result = previewAndApproveContent(
            get_reel.return_value.reel_id,
            PreviewDecisionRequest(decision=True),
            self.db,
            self.user,
        )
        self.assertTrue(result["approved"])
        self.assertTrue(result["queued_for_distribution"])
        self.assertTrue(result["is_saved"])

    @patch("app.routes.reel_routes.get_reel")
    def test_F2_UTC06_TC02_rejects_content(self, get_reel) -> None:
        get_reel.return_value = SimpleNamespace(
            reel_id=uuid4(),
            name=None,
            final_commercial_video_url="video.mp4",
            raw_video_url=None,
            uploaded_video_url=None,
            is_saved=False,
        )

        result = previewAndApproveContent(
            get_reel.return_value.reel_id,
            PreviewDecisionRequest(decision=False),
            self.db,
            self.user,
        )
        self.assertFalse(result["approved"])
        self.assertFalse(result["queued_for_distribution"])

    @patch("app.routes.reel_routes.get_reel", return_value=None)
    def test_F2_UTC06_TC03_rejects_missing_media(self, _get_reel) -> None:
        with self.assertRaises(MediaNotFoundException):
            previewAndApproveContent(
                uuid4(),
                PreviewDecisionRequest(decision=True),
                self.db,
                self.user,
            )

    @patch("app.routes.reel_routes.generateReels.delay")
    @patch("app.routes.reel_routes.increment_retry")
    @patch("app.routes.reel_routes.update_reel")
    @patch("app.routes.reel_routes.get_reel")
    def test_F2_UTC07_TC01_regenerates_with_revised_prompt(
        self,
        get_reel,
        update_reel,
        increment_retry,
        queue_generation,
    ) -> None:
        reel = SimpleNamespace(
            reel_id=uuid4(),
            retry_count=0,
            prompt_text="Old prompt",
        )
        get_reel.return_value = reel

        result = regenerateContent(
            reel.reel_id,
            ReelRegenerateRequest(target="all", prompt_text="Revised prompt"),
            self.db,
            self.user,
        )

        self.assertIs(reel, result)
        self.assertTrue(
            any(
                call.kwargs.get("prompt_text") == "Revised prompt"
                for call in update_reel.call_args_list
            )
        )
        increment_retry.assert_called_once_with(self.db, reel=reel)
        queue_generation.assert_called_once()

    @patch("app.routes.reel_routes.get_reel")
    def test_F2_UTC07_TC02_enforces_regeneration_limit(self, get_reel) -> None:
        get_reel.return_value = SimpleNamespace(
            reel_id=uuid4(),
            retry_count=5,
            prompt_text="Prompt",
        )

        with self.assertRaises(RateLimitExceededException):
            regenerateContent(
                get_reel.return_value.reel_id,
                ReelRegenerateRequest(target="all"),
                self.db,
                self.user,
            )


class TestPromptEndpointTests(PytestAssertions):
    """F2-UTC08, F2-UTC09 and F2-UTC10 prompt assembly behavior."""

    def setup_method(self, _method) -> None:
        self.db = MagicMock()
        self.user = SimpleNamespace(user_id=uuid4())
        self.product_id = uuid4()
        self.product = SimpleNamespace(
            product_name="Cold Brew Kit",
            description="Cold brew product",
            images=[],
        )
        self.db.query.return_value.options.return_value.filter.return_value.first.return_value = self.product

    @patch(
        "app.routes.reel_routes.generate_guided_prompt",
        new_callable=AsyncMock,
        return_value="Assembled guided prompt",
    )
    @pytest.mark.asyncio
    async def test_F2_UTC08_TC01_builds_prompt_with_all_options(
        self,
        generate_guided_prompt,
    ) -> None:
        result = await generate_guided_prompt_endpoint(
            GuidedPromptRequest(
                product_id=self.product_id,
                focus="Cafe morning",
                target="Coffee lovers",
                mood="Calm",
                lighting="Natural",
                style="Cinematic",
                camera_motion="Slow pan",
            ),
            self.db,
            self.user,
        )
        self.assertEqual("Assembled guided prompt", result["prompt"])
        generate_guided_prompt.assert_awaited_once()

    @patch(
        "app.routes.reel_routes.generate_guided_prompt",
        new_callable=AsyncMock,
        return_value="Assembled guided prompt",
    )
    @pytest.mark.asyncio
    async def test_F2_UTC08_TC02_builds_prompt_with_partial_options(
        self,
        generate_guided_prompt,
    ) -> None:
        result = await generate_guided_prompt_endpoint(
            GuidedPromptRequest(
                product_id=self.product_id,
                focus="Cafe morning",
                target="Coffee lovers",
                mood="Calm",
            ),
            self.db,
            self.user,
        )
        self.assertEqual("Assembled guided prompt", result["prompt"])
        generate_guided_prompt.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_F2_UTC08_TC03_rejects_missing_product(self) -> None:
        self.db.query.return_value.options.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(ProductNotFoundException):
            await generate_guided_prompt_endpoint(
                GuidedPromptRequest(
                    product_id=self.product_id,
                    focus="Cafe morning",
                ),
                self.db,
                self.user,
            )

    @patch(
        "app.routes.reel_routes.generate_guided_prompt",
        new_callable=AsyncMock,
        side_effect=GeminiAPIException(),
    )
    @pytest.mark.asyncio
    async def test_F2_UTC08_TC04_propagates_gemini_failure(
        self,
        _generate_guided_prompt,
    ) -> None:
        with self.assertRaises(GeminiAPIException):
            await generate_guided_prompt_endpoint(
                GuidedPromptRequest(
                    product_id=self.product_id,
                    focus="Cafe morning",
                ),
                self.db,
                self.user,
            )

    @patch(
        "app.routes.reel_routes.enhance_prompt",
        new_callable=AsyncMock,
        return_value="Enhanced detailed prompt",
    )
    @pytest.mark.asyncio
    async def test_F2_UTC09_TC01_enhances_prompt(self, _enhance_prompt) -> None:
        result = await enhance_prompt_endpoint(
            EnhancePromptRequest(
                prompt_text="Cold brew coffee video",
                product_id=self.product_id,
            ),
            self.db,
            self.user,
        )
        self.assertEqual("Enhanced detailed prompt", result["prompt"])

    @pytest.mark.asyncio
    async def test_F2_UTC09_TC02_rejects_empty_prompt(self) -> None:
        with self.assertRaises(InvalidPromptException):
            await enhance_prompt_endpoint(
                EnhancePromptRequest(prompt_text=" "),
                self.db,
                self.user,
            )

    @patch(
        "app.routes.reel_routes.enhance_prompt",
        new_callable=AsyncMock,
        side_effect=GeminiAPIException(),
    )
    @pytest.mark.asyncio
    async def test_F2_UTC09_TC03_propagates_gemini_failure(
        self,
        _enhance_prompt,
    ) -> None:
        with self.assertRaises(GeminiAPIException):
            await enhance_prompt_endpoint(
                EnhancePromptRequest(
                    prompt_text="Cold brew coffee video",
                    product_id=self.product_id,
                ),
                self.db,
                self.user,
            )

    @patch(
        "app.routes.reel_routes.generate_prompt_from_template",
        new_callable=AsyncMock,
        return_value="Flash sale prompt",
    )
    @pytest.mark.asyncio
    async def test_F2_UTC10_TC01_builds_template_prompt(
        self,
        _generate_prompt,
    ) -> None:
        result = await generate_prompt_endpoint(
            PromptFromTemplateRequest(
                template_type="flash_sale",
                product_id=self.product_id,
            ),
            self.db,
            self.user,
        )
        self.assertEqual("Flash sale prompt", result["prompt"])

    @pytest.mark.asyncio
    async def test_F2_UTC10_TC02_rejects_missing_product(self) -> None:
        self.db.query.return_value.options.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(ProductNotFoundException):
            await generate_prompt_endpoint(
                PromptFromTemplateRequest(
                    template_type="flash_sale",
                    product_id=self.product_id,
                ),
                self.db,
                self.user,
            )

    @patch(
        "app.routes.reel_routes.generate_prompt_from_template",
        new_callable=AsyncMock,
        side_effect=GeminiAPIException(),
    )
    @pytest.mark.asyncio
    async def test_F2_UTC10_TC03_propagates_gemini_failure(
        self,
        _generate_prompt,
    ) -> None:
        with self.assertRaises(GeminiAPIException):
            await generate_prompt_endpoint(
                PromptFromTemplateRequest(
                    template_type="flash_sale",
                    product_id=self.product_id,
                ),
                self.db,
                self.user,
            )


class TestCaptionGenerationTests(PytestAssertions):
    """F2-UTC03 caption and hashtag generation."""

    @patch.object(ai_service, "_run_gemini", new_callable=AsyncMock)
    @pytest.mark.asyncio
    async def test_F2_UTC03_TC01_returns_caption_and_hashtags(
        self,
        run_gemini,
    ) -> None:
        run_gemini.return_value = json.dumps(
            {
                "caption": "Cold brew for every morning",
                "hashtags": ["#coffee", "#coldbrew", "#morning", "#reelcast"],
            }
        )
        with patch.object(ai_service, "GOOGLE_AI_API_KEY", "test-key"):
            result = await ai_service.generateCaptionsAndHashtags(
                "Make a fun video",
                "Cold brew kit",
                "TikTok",
            )

        self.assertIn("caption", result)
        self.assertEqual(4, len(result["hashtags"]))

    @patch.object(
        ai_service,
        "_run_gemini",
        new_callable=AsyncMock,
        side_effect=GeminiAPIException(),
    )
    @pytest.mark.asyncio
    async def test_F2_UTC03_TC02_maps_gemini_unavailability(
        self,
        _run_gemini,
    ) -> None:
        with patch.object(ai_service, "GOOGLE_AI_API_KEY", "test-key"):
            with self.assertRaises(GeminiAPIException):
                await ai_service.generateCaptionsAndHashtags(
                    "Make a fun video",
                    "Cold brew kit",
                    "TikTok",
                )

    @pytest.mark.asyncio
    async def test_F2_UTC03_TC03_rejects_prompt_over_500_characters(self) -> None:
        with self.assertRaises(InvalidPromptLengthException):
            await ai_service.generateCaptionsAndHashtags(
                "x" * 501,
                "Cold brew kit",
                "TikTok",
            )


class TestCaptionPromptContextTests(PytestAssertions):
    """Caption context stays valid for generated and user-uploaded reels."""

    def test_preserves_existing_prompt(self) -> None:
        self.assertEqual(
            "A cinematic product video",
            _build_caption_prompt("  A cinematic product video  ", "Cold Brew"),
        )

    def test_builds_product_context_for_uploaded_reel(self) -> None:
        self.assertEqual(
            "An uploaded product video featuring Cold Brew.",
            _build_caption_prompt("", "Cold Brew"),
        )

    def test_builds_generic_context_when_product_is_missing(self) -> None:
        self.assertEqual(
            "An uploaded product video for social media.",
            _build_caption_prompt(None),
        )

    def test_caps_enriched_prompt_at_service_limit(self) -> None:
        self.assertEqual(500, len(_build_caption_prompt("x" * 501)))


class TestVideoProviderTests(PytestAssertions):
    """F2-UTC02 video generation and F2-UTC07 regeneration provider errors."""

    @pytest.mark.asyncio
    async def test_F2_UTC02_TC01_generates_video_url(self) -> None:
        fal_client = SimpleNamespace(
            run=MagicMock(return_value={"video": {"url": "https://fal.media/test-video.mp4"}})
        )
        with patch.dict(sys.modules, {"fal_client": fal_client}):
            url = await generate_with_ltx("A cinematic cold brew video")
        self.assertEqual("https://fal.media/test-video.mp4", url)

    @pytest.mark.asyncio
    async def test_F2_UTC02_TC02_maps_provider_failure(self) -> None:
        fal_client = SimpleNamespace(
            run=MagicMock(side_effect=RuntimeError("provider unavailable"))
        )
        with patch.dict(sys.modules, {"fal_client": fal_client}):
            with self.assertRaises(LTXVideoAPIException):
                await generate_with_ltx("Prompt")

    @pytest.mark.asyncio
    async def test_F2_UTC02_TC03_maps_provider_timeout(self) -> None:
        fal_client = SimpleNamespace(
            run=MagicMock(side_effect=TimeoutError("timed out"))
        )
        with patch.dict(sys.modules, {"fal_client": fal_client}):
            with self.assertRaises(GenerationTimeoutException):
                await generate_with_ltx("Prompt")

    @pytest.mark.asyncio
    async def test_F2_UTC07_TC03_maps_regeneration_timeout(self) -> None:
        fal_client = SimpleNamespace(
            run=MagicMock(side_effect=TimeoutError("regen timed out"))
        )
        with patch.dict(sys.modules, {"fal_client": fal_client}):
            with self.assertRaises(GenerationTimeoutException):
                await generate_with_ltx("Revised prompt")

    @pytest.mark.asyncio
    async def test_F2_UTC07_TC04_maps_regeneration_api_failure(self) -> None:
        fal_client = SimpleNamespace(
            run=MagicMock(side_effect=RuntimeError("fal provider unavailable"))
        )
        with patch.dict(sys.modules, {"fal_client": fal_client}):
            with self.assertRaises(LTXVideoAPIException):
                await generate_with_ltx("Revised prompt")
