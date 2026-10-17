import asyncio

import httpx
import pytest

from app.services.base import ProviderError
from app.services.instagram import InstagramProvider
from app.services.sync_policy import run_sync

pytestmark = pytest.mark.asyncio


def media(media_id, kind='IMAGE'):
    return {'id': media_id, 'media_type': kind, 'timestamp': '2026-10-01T00:00:00Z',
            'like_count': 2, 'comments_count': 0}


async def test_instagram_reuses_session_and_deduplicates_media(social_request, social_transport):
    provider = InstagramProvider()
    seen = []

    def handler(request):
        seen.append(request.url.path)
        return httpx.Response(200, json=media(request.url.path.strip('/')))

    clients = social_transport(provider, handler)
    metrics = await provider.sync(social_request('instagram', ['1', '2', '1']))
    assert seen == ['/1', '/2']
    assert [row.external_ref for row in metrics] == ['instagram:1', 'instagram:2']
    assert all(row.comments == 0 and row.views is None and row.shares is None for row in metrics)
    assert len(clients) == 1 and clients[0].is_closed


@pytest.mark.parametrize('exception', [httpx.ConnectTimeout, httpx.ReadTimeout])
async def test_instagram_recovers_from_transient_primary_timeout(exception, social_request, social_transport):
    provider = InstagramProvider()
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if len(calls) == 1:
            raise exception('sensitive transport detail', request=request)
        return httpx.Response(200, json=media('1'))

    clients = social_transport(provider, handler)
    metric, = await provider.sync(social_request('instagram', ['1']))
    assert metric.likes == 2 and calls == ['/1', '/1'] and clients[0].is_closed


@pytest.mark.parametrize('status,attempts', [(504, 3), (503, 3), (401, 1), (403, 1), (429, 1)])
async def test_instagram_terminal_failure_is_bounded_and_safe(status, attempts, social_request, social_transport, caplog):
    provider = InstagramProvider()
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if status == 504:
            raise httpx.ReadTimeout('sensitive transport detail', request=request)
        return httpx.Response(status, json={'error': {'message': 'sensitive body'}}, headers={'Retry-After': '120'})

    clients = social_transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('instagram', ['1']))
    assert error.value.status_code == status and len(calls) == attempts
    assert clients[0].is_closed
    if status == 429:
        assert error.value.retry_after == 120
    assert 'sensitive' not in caplog.text and 'test-token' not in caplog.text
    assert 'sensitive' not in str(error.value)


async def test_instagram_slow_insights_preserve_primary_counts_and_cancel_transport(social_request, social_transport):
    provider = InstagramProvider()
    cancelled = asyncio.Event()

    async def handler(request):
        if request.url.path.endswith('/insights'):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        return httpx.Response(200, json=media('1', 'VIDEO'))

    clients = social_transport(provider, handler)
    metrics, warnings, _ = await run_sync(provider, social_request('instagram', ['1']))
    metric, = metrics
    assert (metric.likes, metric.comments, metric.views, metric.shares, metric.engagement) == (2, 0, None, None, None)
    assert warnings and cancelled.is_set() and clients[0].is_closed


@pytest.mark.parametrize('status', [403, 429])
async def test_instagram_permission_or_rate_limited_insights_do_not_trigger_fallback_storm(status, social_request, social_transport):
    provider = InstagramProvider()
    insights = []

    def handler(request):
        if request.url.path.endswith('/insights'):
            insights.append(request.url.params['metric'])
            return httpx.Response(status, json={'error': {'message': 'unavailable'}})
        return httpx.Response(200, json=media('1', 'VIDEO'))

    clients = social_transport(provider, handler)
    metrics, warnings, _ = await run_sync(provider, social_request('instagram', ['1']))
    assert len(insights) == 1 and warnings
    assert metrics[0].likes == 2 and metrics[0].shares is None and clients[0].is_closed


async def test_instagram_unsupported_views_falls_back_to_plays_and_preserves_measured_zero(social_request, social_transport):
    provider = InstagramProvider()
    requested = []

    def handler(request):
        if not request.url.path.endswith('/insights'):
            return httpx.Response(200, json=media('1', 'VIDEO'))
        requested.append(request.url.params['metric'])
        if len(requested) == 1:
            return httpx.Response(400, json={'error': {'code': 100}})
        return httpx.Response(200, json={'data': [
            {'name': 'plays', 'values': [{'value': 10}]}, {'name': 'shares', 'values': [{'value': 0}]},
        ]})

    clients = social_transport(provider, handler)
    metric, = await provider.sync(social_request('instagram', ['1']))
    assert requested == ['views,reach,shares,saved', 'plays,reach,shares,saved']
    assert (metric.views, metric.shares, metric.engagement) == (10, 0, 2) and clients[0].is_closed


async def test_instagram_absolute_deadline_cancels_primary_and_closes_session(social_request, social_transport):
    provider = InstagramProvider()
    cancelled = asyncio.Event()

    async def handler(request):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    clients = social_transport(provider, handler, sync_timeout_seconds=0.02)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('instagram', ['1']))
    assert error.value.status_code == 504 and error.value.retry_exhausted
    assert cancelled.is_set() and clients[0].is_closed


async def test_instagram_simultaneous_accounts_keep_tokens_and_sessions_separate(social_request, social_transport):
    provider = InstagramProvider()
    seen = []

    async def handler(request):
        await asyncio.sleep(0)
        media_id = request.url.path.strip('/')
        seen.append((media_id, request.headers['Authorization']))
        return httpx.Response(200, json=media(media_id))

    clients = social_transport(provider, handler)
    first, second = await asyncio.gather(provider.sync(social_request('instagram', ['1'], 'first-token')),
                                         provider.sync(social_request('instagram', ['2'], 'second-token')))
    assert set(seen) == {('1', 'Bearer first-token'), ('2', 'Bearer second-token')}
    assert first[0].external_ref == 'instagram:1' and second[0].external_ref == 'instagram:2'
    assert len(clients) == 2 and all(client.is_closed for client in clients)


async def test_instagram_nonempty_discovery_page_keeps_cursor_and_metrics(social_request, social_transport):
    provider = InstagramProvider()
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={'data': [media('1'), media('2')],
            'paging': {'next': 'https://instagram.test/99/media?after=next', 'cursors': {'after': 'next'}}})

    clients = social_transport(provider, handler)
    metrics, _, cursor = await run_sync(provider, social_request('instagram', [], single_page=True, page_cursor='previous'))
    assert [row.external_ref for row in metrics] == ['instagram:1', 'instagram:2']
    assert cursor == 'next' and len(seen) == 1
    assert seen[0].url.params['after'] == 'previous' and clients[0].is_closed
