import asyncio
from datetime import datetime, timezone
import json

import httpx
import pytest

from app.services.base import ProviderError
from app.services.sync_policy import run_sync
from app.services.tiktok import TikTokProvider

pytestmark = pytest.mark.asyncio


def video(video_id):
    return {'id': video_id, 'create_time': int(datetime(2026, 10, 2, tzinfo=timezone.utc).timestamp()),
            'view_count': 10, 'like_count': 2, 'comment_count': 0, 'share_count': 0}


async def test_tiktok_reuses_session_and_batches_unique_ids_without_duplicates(social_request, social_transport):
    provider = TikTokProvider()
    batches = []

    def handler(request):
        assert request.method == 'POST' and request.url.path == '/v2/video/query/'
        ids = json.loads(request.content)['filters']['video_ids']
        batches.append(ids)
        return httpx.Response(200, json={'data': {'videos': [video(value) for value in ids]}})

    clients = social_transport(provider, handler)
    ids = [str(index) for index in range(21)]
    metrics = await provider.sync(social_request('tiktok', ids + ids))
    assert [len(batch) for batch in batches] == [20, 1]
    assert [metric.external_ref for metric in metrics] == ['tiktok:'+value for value in ids]
    assert all((metric.views, metric.comments, metric.shares) == (10, 0, 0) for metric in metrics)
    assert len(clients) == 1 and clients[0].is_closed


@pytest.mark.parametrize('stage', ['status', 'query'])
@pytest.mark.parametrize('exception', [httpx.ConnectTimeout, httpx.ReadTimeout])
async def test_tiktok_retries_only_failed_read_stage_and_preserves_publish_reference(stage, exception, social_request, social_transport):
    provider = TikTokProvider()
    calls = {'status': 0, 'query': 0}

    def handler(request):
        current = 'status' if request.url.path.endswith('/status/fetch/') else 'query'
        calls[current] += 1
        if current == stage and calls[current] == 1:
            raise exception('sensitive transport detail', request=request)
        if current == 'status':
            assert json.loads(request.content) == {'publish_id': 'v_pub_file~job'}
            return httpx.Response(200, json={'data': {'status': 'PUBLISH_COMPLETE', 'publicaly_available_post_id': ['123']}})
        assert json.loads(request.content) == {'filters': {'video_ids': ['123']}}
        return httpx.Response(200, json={'data': {'videos': [video('123')]}})

    clients = social_transport(provider, handler)
    metric, = await provider.sync(social_request('tiktok', ['v_pub_file~job']))
    assert calls[stage] == 2 and calls['query' if stage == 'status' else 'status'] == 1
    assert metric.external_ref == 'tiktok:v_pub_file~job' and metric.views == 10 and clients[0].is_closed


@pytest.mark.parametrize('status,attempts', [(504, 3), (503, 3), (401, 1), (403, 1), (429, 1)])
async def test_tiktok_terminal_failure_is_bounded_and_safe(status, attempts, social_request, social_transport, caplog):
    provider = TikTokProvider()
    calls = []

    def handler(request):
        calls.append(request)
        if status == 504:
            raise httpx.ReadTimeout('sensitive transport detail', request=request)
        return httpx.Response(status, json={'error': {'message': 'sensitive body'}}, headers={'Retry-After': '120'})

    clients = social_transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('tiktok', ['123']))
    assert error.value.status_code == status and len(calls) == attempts and clients[0].is_closed
    if status == 429:
        assert error.value.retry_after == 120
    assert 'sensitive' not in caplog.text and 'test-token' not in caplog.text
    assert 'sensitive' not in str(error.value)


@pytest.mark.parametrize('code,expected', [('rate_limit_exceeded', 429), ('access_token_invalid', 401), ('scope_not_authorized', 403)])
async def test_tiktok_application_errors_do_not_become_successful_empty_results(code, expected, social_request, social_transport):
    provider = TikTokProvider()
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={'error': {'code': code, 'message': 'sensitive body'}})

    clients = social_transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('tiktok', ['123']))
    assert error.value.status_code == expected and len(calls) == 1 and clients[0].is_closed


async def test_tiktok_pending_or_private_publish_job_preserves_unavailable_counters(social_request, social_transport):
    provider = TikTokProvider()
    calls = []

    def handler(request):
        calls.append(request.url.path)
        assert request.url.path == '/v2/post/publish/status/fetch/'
        return httpx.Response(200, json={'data': {'status': 'PROCESSING_UPLOAD', 'publicaly_available_post_id': []}})

    clients = social_transport(provider, handler)
    metric, = await provider.sync(social_request('tiktok', ['v_pub_file~private']))
    assert metric.external_ref == 'tiktok:v_pub_file~private'
    assert metric.views is None and metric.likes is None and metric.shares is None
    assert len(calls) == 1 and clients[0].is_closed


async def test_tiktok_absolute_deadline_cancels_primary_and_closes_session(social_request, social_transport):
    provider = TikTokProvider()
    cancelled = asyncio.Event()

    async def handler(request):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    clients = social_transport(provider, handler, sync_timeout_seconds=0.02)
    with pytest.raises(ProviderError) as error:
        await provider.sync(social_request('tiktok', ['123']))
    assert error.value.status_code == 504 and error.value.retry_exhausted
    assert cancelled.is_set() and clients[0].is_closed


async def test_tiktok_simultaneous_accounts_keep_tokens_and_sessions_separate(social_request, social_transport):
    provider = TikTokProvider()
    seen = []

    async def handler(request):
        await asyncio.sleep(0)
        ids = json.loads(request.content)['filters']['video_ids']
        seen.append((tuple(ids), request.headers['Authorization']))
        return httpx.Response(200, json={'data': {'videos': [video(value) for value in ids]}})

    clients = social_transport(provider, handler)
    first, second = await asyncio.gather(provider.sync(social_request('tiktok', ['1'], 'first-token')),
                                         provider.sync(social_request('tiktok', ['2'], 'second-token')))
    assert set(seen) == {(('1',), 'Bearer first-token'), (('2',), 'Bearer second-token')}
    assert first[0].external_ref == 'tiktok:1' and second[0].external_ref == 'tiktok:2'
    assert len(clients) == 2 and all(client.is_closed for client in clients)


async def test_tiktok_discovery_keeps_next_cursor_and_nonempty_page(social_request, social_transport):
    provider = TikTokProvider()
    seen = []

    def handler(request):
        assert request.url.path == '/v2/video/list/'
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={'data': {'videos': [video('123')], 'has_more': True, 'cursor': 456}})

    clients = social_transport(provider, handler)
    metrics, _, cursor = await run_sync(provider, social_request('tiktok', [], single_page=True, page_cursor=123))
    assert metrics[0].external_ref == 'tiktok:123' and cursor == 456
    assert seen == [{'max_count': 20, 'cursor': 123}] and clients[0].is_closed


async def test_tiktok_rejects_nonadvancing_discovery_cursor_instead_of_false_completion(social_request, social_transport):
    provider = TikTokProvider()
    clients = social_transport(provider, lambda request: httpx.Response(200, json={
        'data': {'videos': [], 'has_more': True, 'cursor': 123}}))
    with pytest.raises(ProviderError) as error:
        await run_sync(provider, social_request('tiktok', [], single_page=True, page_cursor=123))
    assert error.value.status_code == 400 and clients[0].is_closed
