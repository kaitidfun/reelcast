import asyncio
from datetime import date

import httpx
import pytest

from app.schemas import SyncRequest
from app.services.base import ProviderError
from app.services.facebook import FacebookProvider


def sync_request(ids, token='test-token'):
    return SyncRequest(platform='facebook', account_id='account', external_account_id='99',
                       access_token=token, from_date=date(2026, 10, 1),
                       to_date=date(2026, 10, 17), post_ids=ids)


def install_transport(provider, handler):
    clients = []

    def client():
        result = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        clients.append(result)
        return result

    provider.client = client
    provider.require = lambda *args: None
    return clients


@pytest.mark.asyncio
async def test_facebook_reuses_one_session_and_bounds_concurrency_without_duplicates():
    provider = FacebookProvider()
    active = peak = 0
    calls = []

    async def handler(request):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        try:
            await asyncio.sleep(0.01)
            calls.append(request.url.path.rsplit('/', 1)[-1])
            return httpx.Response(200, json={'id': calls[-1], 'shares': {'count': 2}})
        finally:
            active -= 1

    clients = install_transport(provider, handler)
    ids = [f'99_{index}' for index in range(8)]
    metrics = await provider.sync(sync_request(ids + ids))
    assert 1 < peak <= 4
    assert len(clients) == 1 and clients[0].is_closed
    assert len(calls) == 8
    assert [metric.external_ref for metric in metrics] == ['facebook:' + value for value in ids]


@pytest.mark.asyncio
async def test_facebook_retries_one_transient_primary_timeout():
    provider = FacebookProvider()
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise httpx.ReadTimeout('sensitive transport detail', request=request)
        return httpx.Response(200, json={'id': '99_123', 'shares': {'count': 4}})

    install_transport(provider, handler)
    metric, = await provider.sync(sync_request(['99_123']))
    assert attempts == 2 and metric.shares == 4


@pytest.mark.asyncio
@pytest.mark.parametrize('status,attempts', [(504, 3), (429, 1), (401, 1)])
async def test_facebook_terminal_failure_is_bounded_and_closes_session(status, attempts, caplog):
    provider = FacebookProvider()
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        if status == 504:
            raise httpx.ReadTimeout('sensitive transport detail', request=request)
        return httpx.Response(status, json={'error': {'message': 'sensitive detail'}})

    clients = install_transport(provider, handler)
    with pytest.raises(ProviderError) as error:
        await provider.sync(sync_request(['99_123']))
    assert error.value.status_code == status and calls == attempts
    assert clients[0].is_closed
    assert 'sensitive' not in caplog.text and 'test-token' not in caplog.text


@pytest.mark.asyncio
async def test_facebook_slow_optional_shares_preserve_primary_counters():
    provider = FacebookProvider()
    cancelled = asyncio.Event()

    async def handler(request):
        if request.url.params['fields'] == 'post_id':
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        return httpx.Response(200, json={'id': '123', 'views': 8,
            'likes': {'summary': {'total_count': 2}}, 'comments': {'summary': {'total_count': 1}}})

    clients = install_transport(provider, handler)
    metric, = await asyncio.wait_for(provider.sync(sync_request(['123'])), timeout=7)
    assert (metric.views, metric.likes, metric.comments, metric.shares) == (8, 2, 1, None)
    assert cancelled.is_set() and clients[0].is_closed


@pytest.mark.asyncio
async def test_facebook_simultaneous_accounts_keep_tokens_and_sessions_separate():
    provider = FacebookProvider()
    seen = []

    async def handler(request):
        await asyncio.sleep(0.01)
        seen.append((request.url.path.rsplit('/', 1)[-1], request.headers['Authorization']))
        return httpx.Response(200, json={'id': request.url.path.rsplit('/', 1)[-1]})

    clients = install_transport(provider, handler)
    await asyncio.gather(provider.sync(sync_request(['99_1'], 'first-token')),
                         provider.sync(sync_request(['88_2'], 'second-token')))
    assert set(seen) == {('99_1', 'Bearer first-token'), ('88_2', 'Bearer second-token')}
    assert len(clients) == 2 and all(client.is_closed for client in clients)
