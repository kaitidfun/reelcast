import asyncio

from app.core.config import get_settings
from app.services.lazada import LazadaProvider


class LazadaTokenStub(LazadaProvider):
    def __init__(self):
        self.request_args = None

    async def request(self, method, url, **kwargs):
        self.request_args = (method, url, kwargs)
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "country_user_info": [{"seller_id": "seller-1", "seller_name": "Test shop"}],
        }


def test_lazada_token_exchange_signs_authorization_code(monkeypatch):
    monkeypatch.setenv("LAZADA_APP_KEY", "app-key")
    monkeypatch.setenv("LAZADA_APP_SECRET", "app-secret")
    monkeypatch.setenv("LAZADA_TOKEN_URL", "https://auth.lazada.com/rest/auth/token/create")
    get_settings.cache_clear()
    provider = LazadaTokenStub()

    result = asyncio.run(provider.exchange_code(
        code="authorization-code",
        redirect_uri="https://example.test/callback",
    ))

    method, url, request_kwargs = provider.request_args
    params = request_kwargs["params"]
    assert method == "POST"
    assert url == "https://auth.lazada.com/rest/auth/token/create"
    assert params["code"] == "authorization-code"
    assert "data" not in request_kwargs
    assert params["sign"] == provider._sign("/auth/token/create", params)
    assert result.external_shop_id == "seller-1"
    assert result.shop_name == "Test shop"
