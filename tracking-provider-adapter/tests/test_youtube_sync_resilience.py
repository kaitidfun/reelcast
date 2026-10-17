import asyncio

import httpx
import pytest

from app.services.base import ProviderError
from app.services.sync_policy import run_sync
from app.services.youtube import YouTubeProvider

pytestmark = pytest.mark.asyncio


def details(ids):
    return {'items': [{'id': video, 'snippet': {'publishedAt': '2025-01-01T00:00:00Z'},
        'statistics': {'viewCount': '10', 'likeCount': '2', 'commentCount': '0'}} for video in ids]}


def shares(ids):
    return {'columnHeaders': [{'name': 'video'}, {'name': 'shares'}], 'rows': [[video, 0] for video in ids]}


async def test_youtube_reuses_session_and_batches_unique_ids_without_duplicate_metrics(social_request, social_transport):
    provider = YouTubeProvider()
    batches, reports = [], []

    def handler(request):
        if request.url.path.endswith('/videos'):
            ids = request.url.params['id'].split(',')
            batches.append(ids)
            return httpx.Response(200, json=details(ids))
        assert request.url.host == 'analytics.test'
        ids = request.url.params['filters'].removeprefix('video==').split(',')
        reports.append(ids)
        return httpx.Response(200, json=shares(ids))

    clients = social_transport(provider, handler)
    ids = [f'video-{index}' for index in range(51)]
    metrics = await provider.sync(social_request('youtube', ids + ids))
    assert [len(batch) for batch in batches] == [50, 1] and reports == batches
    assert [metric.external_ref for metric in metrics] == ['youtube:'+video for video in ids]
    assert all((metric.views, metric.comments, metric.shares) == (10, 0, 0) for metric in metrics)
    assert len(clients) == 1 and clients[0].is_closed


@pytest.mark.parametrize('exception', [httpx.ConnectTimeout, httpx.ReadTimeout])
async def test_youtube_retries_primary_timeout_without_duplicating_analytics(exception, social_request, social_transport):
    provider = YouTubeProvider()
    primary, analytics = [], []

    def handler(request):
        if request.url.host == 'analytics.test':
            analytics.append(request)
            return httpx.Response(200, json=shares(['old']))
        primary.append(request)
        if len(primary) == 1:
            raise exception('sensitive transport detail', request=request)
        return httpx.Response(200, json=details(['old']))

    clients = social_transport(provider, handler)
    metric, = await provider.sync(social_request('youtube', ['old']))
    assert len(primary) == 2 and len(analytics) == 1
    assert metric.views == 10 and metric.shares == 0 and clients[0].is_closed


@pytest.mark.parametrize('status,attempts', [(504, 3), (503, 3), (401, 1), (403, 1), (429, 1)])
async def test_youtube_terminal_failure_is_bounded_and_safe(status, attempts, social_request, social_transport, caplog):
    provider = YouTubeProvider()
    calls = []

    def handler(request):
        calls.append(request)
        if status == 504:
            raise httpx.ReadTimeout('sensitive transport detail', request=request)
        return httpx.Response(status, json={'error': {'message': 'sensitive body'}}, headers={'Retry-After': '120'})

    clients = social_transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('youtube', ['old']))
    assert error.value.status_code == status and len(calls) == attempts
    assert clients[0].is_closed
    if status == 429:
        assert error.value.retry_after == 120
    assert 'sensitive' not in caplog.text and 'test-token' not in caplog.text
    assert 'sensitive' not in str(error.value)


async def test_youtube_403_quota_is_deferred_without_auth_retry_or_analytics_call(social_request, social_transport):
    provider = YouTubeProvider()
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(403, json={'error': {'code': 403, 'errors': [{'reason': 'quotaExceeded'}]}},
                              headers={'Retry-After': '3600'})

    clients = social_transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('youtube', ['old']))
    assert error.value.status_code == 429 and error.value.retry_after == 3600
    assert len(calls) == 1 and clients[0].is_closed


@pytest.mark.parametrize('status', [403, 429, 504])
async def test_youtube_analytics_failure_preserves_data_api_counters(status, social_request, social_transport):
    provider = YouTubeProvider()
    analytics = []

    def handler(request):
        if request.url.host != 'analytics.test':
            return httpx.Response(200, json=details(['old']))
        analytics.append(request)
        if status == 504:
            raise httpx.ReadTimeout('sensitive detail', request=request)
        return httpx.Response(status, json={'error': {'message': 'unavailable'}})

    clients = social_transport(provider, handler)
    metrics, warnings, _ = await run_sync(provider, social_request('youtube', ['old']))
    metric, = metrics
    assert (metric.views, metric.likes, metric.comments, metric.shares, metric.engagement) == (10, 2, 0, None, 2)
    assert len(analytics) == 1 and warnings and clients[0].is_closed


async def test_youtube_slow_analytics_is_cancelled_without_losing_primary_metrics(social_request, social_transport):
    provider = YouTubeProvider()
    cancelled = asyncio.Event()

    async def handler(request):
        if request.url.host == 'analytics.test':
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        return httpx.Response(200, json=details(['old']))

    clients = social_transport(provider, handler)
    metrics, warnings, _ = await run_sync(provider, social_request('youtube', ['old']))
    assert metrics[0].views == 10 and metrics[0].shares is None
    assert warnings and cancelled.is_set() and clients[0].is_closed


async def test_youtube_absolute_deadline_cancels_primary_and_closes_session(social_request, social_transport):
    provider = YouTubeProvider()
    cancelled = asyncio.Event()

    async def handler(request):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    clients = social_transport(provider, handler, sync_timeout_seconds=0.02)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('youtube', ['old']))
    assert error.value.status_code == 504 and error.value.retry_exhausted
    assert cancelled.is_set() and clients[0].is_closed


async def test_youtube_simultaneous_accounts_isolate_data_and_analytics_credentials(social_request, social_transport):
    provider = YouTubeProvider()
    seen = []

    async def handler(request):
        await asyncio.sleep(0)
        analytics = request.url.host == 'analytics.test'
        video = request.url.params['filters'].removeprefix('video==') if analytics else request.url.params['id']
        seen.append((video, request.headers['Authorization']))
        return httpx.Response(200, json=shares([video]) if analytics else details([video]))

    clients = social_transport(provider, handler)
    first, second = await asyncio.gather(provider.sync(social_request('youtube', ['first'], 'first-token')),
                                         provider.sync(social_request('youtube', ['second'], 'second-token')))
    assert seen.count(('first', 'Bearer first-token')) == 2
    assert seen.count(('second', 'Bearer second-token')) == 2 and len(seen) == 4
    assert first[0].external_ref == 'youtube:first' and second[0].external_ref == 'youtube:second'
    assert len(clients) == 2 and all(client.is_closed for client in clients)


async def test_youtube_discovery_preserves_next_page_cursor_after_fetching_metrics(social_request, social_transport):
    provider = YouTubeProvider()
    searches = []

    def handler(request):
        if request.url.path.endswith('/search'):
            searches.append(request)
            return httpx.Response(200, json={'items': [{'id': {'videoId': 'old'}}], 'nextPageToken': 'next'})
        return httpx.Response(200, json=shares(['old']) if request.url.host == 'analytics.test' else details(['old']))

    clients = social_transport(provider, handler)
    metrics, _, cursor = await run_sync(provider, social_request('youtube', [], single_page=True, page_cursor='previous'))
    assert metrics[0].external_ref == 'youtube:old' and metrics[0].views == 10 and cursor == 'next'
    assert len(searches) == 1 and searches[0].url.params['pageToken'] == 'previous'
    assert clients[0].is_closed
