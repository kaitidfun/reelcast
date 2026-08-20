import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def client(monkeypatch):
    for platform in ("TIKTOK_SHOP", "SHOPEE", "LAZADA", "TIKTOK", "YOUTUBE", "FACEBOOK", "INSTAGRAM"):
        monkeypatch.setenv(f"ADAPTER_KEY_{platform}", f"test-{platform.lower()}")
    get_settings.cache_clear()
    return TestClient(create_app())
