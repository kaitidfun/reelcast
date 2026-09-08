from __future__ import annotations

import pytest
from tests.pytest_helpers import PytestAssertions

import tempfile
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.exceptions import (
    FFmpegProcessingException,
    InvalidCoordinateException,
)
from app.services.overlay_service import _FFMPEG_EXE, overlay_watermark
from app.services.upload_service import (
    MAX_VIDEO_SIZE_BYTES,
    validate_video_file,
)


class TestVideoValidationTests(PytestAssertions):
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


class TestOverlayTests(PytestAssertions):
    """F2-UTC05 overlay validation and FFmpeg failure mapping."""

    @pytest.mark.asyncio
    async def test_F2_UTC05_TC03_rejects_out_of_bounds_position(self) -> None:
        with self.assertRaises(InvalidCoordinateException):
            await overlay_watermark(
                "input.mp4",
                "logo.png",
                "out-of-bounds",
                "output.mp4",
            )

    @patch("app.services.overlay_service.subprocess.run")
    @pytest.mark.asyncio
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
    @pytest.mark.asyncio
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

    @patch("app.services.overlay_service.subprocess.run")
    @pytest.mark.asyncio
    async def test_native_crash_reports_exit_code_and_stderr_tail(self, run) -> None:
        run.return_value = SimpleNamespace(
            returncode=0xC0000005,
            stderr=b"banner " * 1000 + b"scaler crashed",
        )
        with self.assertRaises(FFmpegProcessingException) as caught:
            await overlay_watermark("input.mp4", "logo.jpg", "center", "output.mp4")
        message = str(caught.exception)
        self.assertIn("0xC0000005", message)
        self.assertTrue(message.endswith("scaler crashed"))
        self.assertLess(len(message), 4200)

    @pytest.mark.asyncio
    async def test_jpeg_overlay_with_odd_scaled_height_renders_and_decodes(self) -> None:
        """750x726 used to scale to 150x145 and crash Windows FFmpeg 7.1."""
        from PIL import Image

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video, logo, output = (root / name for name in ("input.mp4", "logo.jpg", "output.mp4"))
            Image.new("RGB", (750, 726), "red").save(logo, subsampling=2)
            subprocess.run(
                [_FFMPEG_EXE, "-hide_banner", "-loglevel", "error", "-nostdin",
                 "-f", "lavfi", "-i", "color=c=blue:s=320x480:r=25:d=1",
                 "-c:v", "libx264", "-y", str(video)],
                capture_output=True, check=True, timeout=30,
            )
            await overlay_watermark(str(video), str(logo), "bottom-right", str(output))
            decoded = subprocess.run(
                [_FFMPEG_EXE, "-hide_banner", "-loglevel", "error", "-xerror",
                 "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                capture_output=True, check=True, timeout=30,
            )
            self.assertEqual(len(decoded.stdout), 25 * 320 * 480 * 3)
            # Confirm the overlay appears in the first and final frames.
            for frame in (0, 24):
                offset = (frame * 320 * 480 + 400 * 320 + 250) * 3
                red, green, blue = decoded.stdout[offset:offset + 3]
                self.assertGreater(red, 200)
                self.assertLess(green, 40)
                self.assertLess(blue, 40)
