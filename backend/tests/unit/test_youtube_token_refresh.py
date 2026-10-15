from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx
import pytest

from app.exceptions import OAuthProviderException, OAuthReauthorizationRequiredException
from app.models.models import SocialAccount
from app.services import oauth_platforms, social_account_service, tracking_provider_service
from app.services.crypto_service import encrypt_token, decrypt_token


def client_responses(monkeypatch, responses):
    client = AsyncMock()
    client.post.side_effect = responses
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(oauth_platforms.httpx, 'AsyncClient', lambda **kw: context)
    monkeypatch.setattr(oauth_platforms, 'is_configured', lambda platform: True)
    return client


def response(status, body):
    return httpx.Response(status, json=body, request=httpx.Request('POST', 'https://oauth2.googleapis.com/token'))


def test_youtube_consent_requests_offline_access(monkeypatch):
    monkeypatch.setattr(oauth_platforms, 'is_configured', lambda platform: True)
    query = parse_qs(urlsplit(oauth_platforms.build_authorize_url('youtube', 'state')).query)
    assert query['access_type'] == ['offline'] and query['prompt'] == ['consent']


@pytest.mark.asyncio
async def test_invalid_grant_requires_reauthorization_without_retries_or_secret_leaks(monkeypatch):
    client = client_responses(monkeypatch, [response(400, {'error':'invalid_grant', 'error_description':'sensitive-token'})])
    with pytest.raises(OAuthReauthorizationRequiredException) as error:
        await oauth_platforms.refresh_access_token('youtube','private-refresh')
    assert 'invalid_grant' in str(error.value) and 'reconnect this platform' in str(error.value)
    assert 'sensitive-token' not in str(error.value) and 'private-refresh' not in str(error.value)
    assert client.post.await_count == 1


@pytest.mark.asyncio
async def test_temporary_refresh_failure_retries_then_recovers(monkeypatch):
    client = client_responses(monkeypatch, [response(503, {}),response(200, {'access_token':'fresh'})])
    monkeypatch.setattr(oauth_platforms.asyncio,'sleep',AsyncMock())
    result = await oauth_platforms.refresh_access_token('youtube','existing-refresh')
    assert result == {'access_token':'fresh','refresh_token':None}
    assert client.post.await_count == 2
    assert client.post.call_args.kwargs['data']['grant_type'] == 'refresh_token'
    assert client.post.call_args.kwargs['data']['refresh_token'] == 'existing-refresh'


@pytest.mark.asyncio
async def test_invalid_client_does_not_request_reauthorization(monkeypatch):
    client_responses(monkeypatch,[response(401,{'error':'invalid_client'})])
    with pytest.raises(OAuthProviderException) as error:
        await oauth_platforms.refresh_access_token('youtube','existing-refresh')
    assert not isinstance(error.value,OAuthReauthorizationRequiredException)
    assert 'configuration' in str(error.value)


@pytest.mark.asyncio
async def test_youtube_new_connection_must_include_refresh_token(monkeypatch):
    client_responses(monkeypatch,[response(200,{'access_token':'one-hour-token'})])
    with pytest.raises(OAuthReauthorizationRequiredException):
        await oauth_platforms.exchange_code_for_token('youtube','authorization-code')


@pytest.mark.asyncio
async def test_sync_saves_new_access_but_preserves_google_refresh_and_history():
    account = SocialAccount(account_id=uuid4(), user_id=uuid4(),platform_name='youtube',
                            access_token=encrypt_token('old-access'),refresh_token=encrypt_token('existing-refresh'),
                            external_account_id='channel',sync_error='previous error')
    original_id=account.account_id
    db=MagicMock()
    with patch.object(oauth_platforms,'refresh_access_token',new=AsyncMock(return_value={'access_token':'fresh-access','refresh_token':None})), \
         patch.object(tracking_provider_service,'_sync_metrics',new=AsyncMock(return_value=3)) as sync:
        count=await tracking_provider_service.sync_social_account(db,account)
    assert count==3 and sync.call_args.kwargs['access_token']=='fresh-access'
    assert decrypt_token(account.refresh_token)=='existing-refresh'
    assert account.account_id==original_id and account.sync_error is None
    db.delete.assert_not_called()


@pytest.mark.asyncio
async def test_reauthorization_error_keeps_stored_tokens_and_stops_metrics_fetch():
    account=SocialAccount(account_id=uuid4(),user_id=uuid4(),platform_name='youtube',
                          access_token=encrypt_token('old-access'),refresh_token=encrypt_token('existing-refresh'))
    db=MagicMock()
    with patch.object(oauth_platforms,'refresh_access_token',new=AsyncMock(side_effect=OAuthReauthorizationRequiredException('youtube invalid_grant; reconnect this platform in Settings'))), \
         patch.object(tracking_provider_service,'_sync_metrics',new=AsyncMock()) as sync:
        assert await tracking_provider_service.sync_social_account(db,account)==0
    sync.assert_not_called()
    assert decrypt_token(account.refresh_token)=='existing-refresh'
    assert 'invalid_grant' in account.sync_error
    db.delete.assert_not_called()
