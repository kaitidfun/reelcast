from __future__ import annotations

import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.exceptions import (
    FFmpegProcessingException,
    InvalidCoordinateException,
)
from app.services.overlay_service import overlay_watermark
from app.services.upload_service import (
    MAX_VIDEO_SIZE_BYTES,
    validate_video_file,
)


class VideoValidationTests(unittest.TestCase):
    """F2-UTC04 upload format, size, and duration validation."""

    def test_F2_UTC04_TC01_accepts_mp4(self) -> None:
        self.assertEqual([], validate_video_file("commercial_valid.mp4", 100 * 1024 * 1024, 45))

    def test_F2_UTC04_TC04_accepts_mov(self) -> None:
        self.assertEqual([], validate_video_file("commercial.mov", 100 * 1024 * 1024, 45))

    def test_F2_UTC04_TC05_accepts_avi(self) -> None:
        self.assertEqual([], validate_video_file("commercial.avi", 100 * 1024 * 1024, 45))

    def test_F2_UTC04_TC02_rejects_mkv(self) -> None:
        errors = validate_video_file(
            "commercial_invalid.mkv",
            100 * 1024 * 1024,
            45,
        )
        self.assertTrue(any("Unsupported format" in error for error in errors))

    def test_F2_UTC04_TC03_rejects_file_over_500mb(self) -> None:
        errors = validate_video_file(
            "commercial_oversize.mp4",
            MAX_VIDEO_SIZE_BYTES + 1,
            45,
        )
        self.assertTrue(any("exceeds 500 MB" in error for error in errors))

    def test_F2_UTC04_TC06_rejects_duration_over_60_seconds(self) -> None:
        errors = validate_video_file(
            "commercial_long.mp4",
            100 * 1024 * 1024,
            61,
        )
        self.assertTrue(any("exceeds 60s" in error for error in errors))


class OverlayTests(unittest.IsolatedAsyncioTestCase):
    """F2-UTC05 overlay validation and FFmpeg failure mapping."""

    async def test_F2_UTC05_TC03_rejects_out_of_bounds_position(self) -> None:
        with self.assertRaises(InvalidCoordinateException):
            await overlay_watermark(
                "input.mp4",
                "logo.png",
                "out-of-bounds",
                "output.mp4",
            )

    @patch("app.services.overlay_service.subprocess.run")
    async def test_F2_UTC05_TC02_maps_ffmpeg_failure(self, run) -> None:
        run.return_value = SimpleNamespace(
            returncode=1,
            stderr=b"ffmpeg render failed",
        )

        with self.assertRaises(FFmpegProcessingException):
            await overlay_watermark(
                "input.mp4",
                "logo.png",
                "bottom-right",
                tempfile.mktemp(suffix=".mp4"),
            )

    @patch("app.services.overlay_service.subprocess.run")
    async def test_F2_UTC05_TC01_returns_finalized_output_path(self, run) -> None:
        run.return_value = SimpleNamespace(returncode=0, stderr=b"")
        output_path = tempfile.mktemp(suffix=".mp4")

        result = await overlay_watermark(
            "input.mp4",
            "logo.png",
            "bottom-right",
            output_path,
        )

        self.assertEqual(output_path, result)
