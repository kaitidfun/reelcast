import asyncio
from datetime import date

import httpx
import pytest

from app.core.config import Settings
from app.schemas import SyncRequest
from app.services.base import ProviderClient, ProviderError
from app.services.facebook import FacebookProvider
from app.services.instagram import InstagramProvider
from app.services.tiktok import TikTokProvider
from app.services.youtube import YouTubeProvider
from app.services.sync_policy import pooled_sync, run_sync, optional_metrics


def payload(platform, **kwargs):
    return SyncRequest(platform=platform, account_id='test', external_account_id='99', access_token='private',
                       from_date=date(2026, 10, 1), to_date=date(2026, 10, 17), **kwargs)


class ReadProvider(ProviderClient):
    platform = 'youtube'

    def authorization_url(self, **kwargs):
        return ''

    @pooled_sync
    async def sync(self, request):
        for _ in range(2):
            await self.request('GET', 'https://provider.test/stats', headers={'Authorization': 'Bearer '+request.access_token})
        return []


def transport(provider, handler, **settings):
    config = Settings(_env_file=None, **settings)
    provider.settings = lambda: config
    clients = []
    def client():
        instance = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        clients.append(instance)
        return instance
    provider.client = client
    return clients


@pytest.mark.asyncio
@pytest.mark.parametrize('platform', ['youtube', 'facebook', 'instagram', 'tiktok'])
async def test_common_session_and_transient_retries_apply_to_every_platform(platform):
    provider = ReadProvider(); provider.platform = platform
    seen = []
    def handler(request):
        seen.append(request.headers['Authorization'])
        if len(seen) == 1:
            raise httpx.ConnectTimeout('private detail', request=request)
        return httpx.Response(200, json={})
    clients = transport(provider, handler)
    metrics, warnings, cursor = await run_sync(provider, payload(platform))
    assert metrics == [] and warnings == [] and cursor is None
    assert seen == ['Bearer private'] * 3
    assert len(clients) == 1 and clients[0].is_closed


@pytest.mark.asyncio
async def test_absolute_deadline_cancels_transport_and_closes_session():
    provider = ReadProvider()
    cancelled = asyncio.Event()
    async def handler(request):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
    clients = transport(provider, handler, sync_timeout_seconds=0.03)
    with pytest.raises(ProviderError) as error:
        await run_sync(provider, payload('youtube'))
    assert error.value.status_code == 504 and error.value.retry_exhausted
    assert cancelled.is_set() and clients[0].is_closed


@pytest.mark.asyncio
@pytest.mark.parametrize('status,body,expected', [
    (403, {'error': {'errors': [{'reason': 'quotaExceeded'}]}}, 429),
    (403, {'error': {'code': 10}}, 403),
    (200, {'error': {'code': 190}}, 401),
    (200, {'error': {'code': 'rate_limit_exceeded'}}, 429),
    (400, {'error': {'code': 'scope_permission_missed'}}, 403),
])
async def test_provider_codes_control_recovery_instead_of_blanket_403_auth(status, body, expected):
    provider = ReadProvider()
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(status, json=body, headers={'Retry-After': '120'})
    transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await run_sync(provider, payload('youtube'))
    assert error.value.status_code == expected and len(calls) == 1
    if expected == 429:
        assert error.value.retry_after == 120


@pytest.mark.asyncio
async def test_shared_policy_never_retries_non_read_post():
    provider = ReadProvider()
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(503, json={})
    transport(provider, handler)
    @pooled_sync
    async def write(self, request):
        return await self.request('POST', 'https://provider.test/publish')
    with pytest.raises(ProviderError):
        await write(provider, payload('youtube'))
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('provider_class,body,expected', [
    (FacebookProvider, {'data': [], 'paging': {'next': 'https://provider.test/posts?after=next', 'cursors': {'after': 'next'}}}, 'next'),
    (InstagramProvider, {'data': [], 'paging': {'next': 'https://provider.test/media?after=next', 'cursors': {'after': 'next'}}}, 'next'),
    (YouTubeProvider, {'items': [], 'nextPageToken': 'next'}, 'next'),
    (TikTokProvider, {'data': {'videos': [], 'has_more': True, 'cursor': 123}}, 123),
])
async def test_all_platforms_return_one_page_and_resumable_cursor(provider_class, body, expected):
    provider = provider_class()
    seen = []
    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=body)
    clients = transport(provider, handler,
        facebook_graph_api_base_url='https://provider.test', instagram_graph_api_base_url='https://provider.test',
        youtube_api_base_url='https://provider.test', tiktok_api_base_url='https://provider.test')
    cursor = 55 if provider.platform == 'tiktok' else 'previous'
    metrics, warnings, next_cursor = await run_sync(provider, payload(provider.platform, single_page=True, page_cursor=cursor))
    assert metrics == [] and next_cursor == expected and len(seen) == 1
    if provider.platform in {'facebook', 'instagram'}:
        assert seen[0].url.params['after'] == 'previous'
    elif provider.platform == 'youtube':
        assert seen[0].url.params['pageToken'] == 'previous'
    assert clients[0].is_closed


@pytest.mark.asyncio
async def test_optional_budget_returns_partial_warning_without_failing_primary():
    class OptionalProvider(ReadProvider):
        @optional_metrics(dict)
        async def extra(self):
            await asyncio.Event().wait()

        @pooled_sync
        async def sync(self, request):
            await self.request('GET', 'https://provider.test/stats')
            assert await self.extra() == {}
            return []
    provider = OptionalProvider()
    transport(provider, lambda request: httpx.Response(200, json={}), optional_timeout_seconds=0.02)
    metrics, warnings, _ = await run_sync(provider, payload('youtube'))
    assert metrics == [] and warnings == ['Some optional metrics are unavailable']
