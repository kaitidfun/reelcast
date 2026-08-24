from datetime import date

import httpx
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError
from app.services.youtube import YouTubeProvider


class SyncStub:
    platform = "tiktok"

    def authorization_url(self, **kwargs):
        raise AssertionError

    async def sync(self, request):
        return [Metric(external_ref="post-1", record_date=date(2026, 8, 20), views=4)]


class ErrorStub(SyncStub):
    async def sync(self, request):
        raise ProviderError("tiktok", "provider request timed out", 504)


def payload():
    return {"platform": "tiktok", "account_id": "account-1", "external_account_id": "channel-1", "access_token": "token", "from_date": "2026-08-01", "to_date": "2026-08-20"}


def test_sync_requires_correct_platform_key(client):
    client.app.state.providers["tiktok"] = SyncStub()
    assert client.post("/sync/tiktok", json=payload()).status_code == 401
    assert client.post("/sync/tiktok", json=payload(), headers={"X-ReelCast-Adapter-Key": "wrong"}).status_code == 401
    response = client.post("/sync/tiktok", json=payload(), headers={"X-ReelCast-Adapter-Key": "test-tiktok"})
    assert response.status_code == 200
    assert response.json()["metrics"][0]["external_ref"] == "post-1"


def test_sync_validates_body_and_provider_timeout(client):
    invalid = payload(); invalid.pop("access_token")
    assert client.post("/sync/tiktok", json=invalid, headers={"X-ReelCast-Adapter-Key": "test-tiktok"}).status_code == 422
    client.app.state.providers["tiktok"] = ErrorStub()
    assert client.post("/sync/tiktok", json=payload(), headers={"X-ReelCast-Adapter-Key": "test-tiktok"}).status_code == 504


class TransportProvider(ProviderClient):
    platform = "test"

    def authorization_url(self, **kwargs):
        return ""

    async def sync(self, request):
        return []


@pytest.mark.asyncio
async def test_provider_http_timeout_is_safely_mapped(monkeypatch):
    provider = TransportProvider()
    provider.client = lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda _: (_ for _ in ()).throw(httpx.ReadTimeout("timeout"))))
    with pytest.raises(ProviderError) as error:
        await provider.request("GET", "https://provider.example")
    assert error.value.status_code == 504


@pytest.mark.asyncio
async def test_provider_http_error_is_safely_mapped():
    provider = TransportProvider()
    provider.client = lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(500, json={"unsafe": "provider-detail"})))
    with pytest.raises(ProviderError) as error:
        await provider.request("GET", "https://provider.example")
    assert error.value.status_code == 502


@pytest.mark.asyncio
async def test_provider_application_error_is_safely_mapped():
    provider = TransportProvider()
    provider.client = lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"code": "INVALID_TOKEN", "message": "sensitive"})))
    with pytest.raises(ProviderError) as error:
        await provider.request("GET", "https://provider.example")
    assert error.value.reason == "provider returned an error"


@pytest.mark.asyncio
async def test_youtube_sync_reads_a_known_private_post_id_when_search_is_empty():
    provider = YouTubeProvider()
    provider.settings = lambda: SimpleNamespace(youtube_api_base_url="https://youtube.example")
    provider.request = AsyncMock(side_effect=[
        {"items": []},
        {"items": [{"id": "private-video", "snippet": {"publishedAt": "2026-08-25T12:00:00Z"}, "statistics": {"viewCount": "3", "likeCount": "1", "commentCount": "2"}}]},
    ])
    request = SyncRequest(
        platform="youtube", account_id="account-1", external_account_id="channel-1",
        access_token="token", from_date=date(2026, 8, 1), to_date=date(2026, 8, 25),
        known_post_ids=["private-video"],
    )

    metrics = await provider.sync(request)

    assert metrics[0].external_ref == "youtube:private-video"
    assert metrics[0].views == 3
    assert metrics[0].engagement == 3
    assert provider.request.await_args_list[1].kwargs["params"]["id"] == "private-video"
