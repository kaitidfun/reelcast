from __future__ import annotations

import unittest
from unittest.mock import patch

from app.exceptions import DistributionPublishException
from app.services.distribution_publish_service import publish_to_tiktok


class _Response:
    def __init__(self, *, payload: dict | None = None, content: bytes = b"", headers: dict | None = None) -> None:
        self._payload = payload
        self.content = content
        self.headers = headers or {}

    def json(self) -> dict | None:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _TikTokClient:
    def __init__(self, creator_payload: dict) -> None:
        self.creator_payload = creator_payload
        self.posts: list[tuple[str, dict]] = []
        self.uploads: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def get(self, _url: str) -> _Response:
        return _Response(content=b"video-bytes", headers={"content-type": "video/mp4"})

    async def post(self, url: str, **kwargs) -> _Response:
        self.posts.append((url, kwargs))
        if url.endswith("creator_info/query/"):
            return _Response(payload=self.creator_payload)
        return _Response(payload={
            "data": {"publish_id": "publish-123", "upload_url": "https://upload.example/video"},
            "error": {"code": "ok"},
        })

    async def put(self, _url: str, **kwargs) -> _Response:
        self.uploads.append(kwargs)
        return _Response()


class TikTokPublishTests(unittest.IsolatedAsyncioTestCase):
    async def test_direct_post_queries_creator_then_uploads_video_bytes(self) -> None:
        client = _TikTokClient({
            "data": {"privacy_level_options": ["PUBLIC_TO_EVERYONE", "SELF_ONLY"]},
            "error": {"code": "ok"},
        })
        with patch("app.services.distribution_publish_service.httpx.AsyncClient", return_value=client):
            publish_id = await publish_to_tiktok("token", "https://storage.example/video.mp4", "A caption")

        self.assertEqual("publish-123", publish_id)
        self.assertEqual(2, len(client.posts))
        init_body = client.posts[1][1]["json"]
        self.assertEqual("FILE_UPLOAD", init_body["source_info"]["source"])
        self.assertEqual("SELF_ONLY", init_body["post_info"]["privacy_level"])
        self.assertEqual(1, len(client.uploads))
        self.assertEqual("bytes 0-10/11", client.uploads[0]["headers"]["Content-Range"])

    async def test_direct_post_accepts_an_empty_201_upload_response(self) -> None:
        """TikTok's upload endpoint commonly responds 201 with no JSON body."""
        client = _TikTokClient({
            "data": {"privacy_level_options": ["SELF_ONLY"]},
            "error": {"code": "ok"},
        })
        with patch("app.services.distribution_publish_service.httpx.AsyncClient", return_value=client):
            publish_id = await publish_to_tiktok("token", "https://storage.example/video.mp4", "A caption")

        self.assertEqual("publish-123", publish_id)

    async def test_direct_post_rejects_creator_without_self_only_access(self) -> None:
        client = _TikTokClient({
            "data": {"privacy_level_options": ["PUBLIC_TO_EVERYONE"]},
            "error": {"code": "ok"},
        })
        with patch("app.services.distribution_publish_service.httpx.AsyncClient", return_value=client):
            with self.assertRaisesRegex(DistributionPublishException, "did not allow SELF_ONLY"):
                await publish_to_tiktok("token", "https://storage.example/video.mp4", "A caption")

        self.assertEqual(1, len(client.posts))

    async def test_direct_post_surfaces_tiktok_api_error_payload(self) -> None:
        client = _TikTokClient({
            "data": {},
            "error": {"code": "scope_not_authorized", "message": "video.publish is required"},
        })
        with patch("app.services.distribution_publish_service.httpx.AsyncClient", return_value=client):
            with self.assertRaisesRegex(DistributionPublishException, "video.publish is required"):
                await publish_to_tiktok("token", "https://storage.example/video.mp4", "A caption")
