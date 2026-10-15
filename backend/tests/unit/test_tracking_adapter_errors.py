import httpx
import pytest
from app.services import tracking_provider_service as provider


@pytest.mark.asyncio
@pytest.mark.parametrize('status,detail,expected', [
    (401, 'Invalid adapter key', 'keys do not match'),
    (401, 'youtube: provider rejected the access token', 'reconnect this platform'),
    (502, 'sensitive body with access_token=secret', 'adapter returned HTTP 502'),
])
async def test_adapter_errors_are_actionable_without_exposing_bodies(monkeypatch, status, detail, expected):
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json={'detail':detail}))
    monkeypatch.setitem(provider._PROVIDERS,'youtube',provider.ProviderConfig('https://adapter.test/sync/youtube','key'))
    monkeypatch.setattr(provider.httpx,'AsyncClient',lambda **kwargs: original_client(transport=transport, **kwargs))
    with pytest.raises(provider.TrackingProviderError) as error:
        await provider._request_adapter(platform='youtube',account_id='account',external_account_id='channel',access_token='private-token')
    assert expected in str(error.value)
    assert 'secret' not in str(error.value) and 'private-token' not in str(error.value)
