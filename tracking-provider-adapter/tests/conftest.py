import os
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.schemas import SyncRequest


@pytest.fixture
def client(monkeypatch):
    for platform in ("TIKTOK_SHOP", "SHOPEE", "LAZADA", "TIKTOK", "YOUTUBE", "FACEBOOK", "INSTAGRAM"):
        monkeypatch.setenv(f"ADAPTER_KEY_{platform}", f"test-{platform.lower()}")
    get_settings.cache_clear()
    return TestClient(create_app())


@pytest.fixture
def social_request():
    def make(platform, ids, token='test-token', **kwargs):
        return SyncRequest(platform=platform, account_id='account', external_account_id='99',
            access_token=token, post_ids=ids, from_date=date(2026, 10, 1),
            to_date=date(2026, 10, 17), **kwargs)
    return make


@pytest.fixture
def social_transport(monkeypatch):
    """Exercise real providers/request policy with isolated HTTP and no backoff sleeps."""
    monkeypatch.setattr('app.services.base.random.uniform', lambda *_: 0)

    def install(provider, handler, **overrides):
        settings = dict(youtube_api_base_url='https://youtube.test',
            youtube_analytics_api_base_url='https://analytics.test',
            instagram_graph_api_base_url='https://instagram.test', tiktok_api_base_url='https://tiktok.test',
            request_timeout_seconds=15, sync_timeout_seconds=24, optional_timeout_seconds=0.05,
            read_attempts=3)
        settings.update(overrides)
        config = Settings(_env_file=None, **settings)
        provider.settings = lambda: config
        clients = []

        def client():
            result = httpx.AsyncClient(transport=httpx.MockTransport(handler))
            clients.append(result)
            return result

        provider.client = client
        return clients
    return install
