from app.schemas import Metric, SyncRequest, TokenExchangeResponse
from app.services.base import ProviderError


class ShopStub:
    platform = "tiktok_shop"

    def authorization_url(self, *, state, redirect_uri):
        assert state == "csrf-state-123"
        assert redirect_uri.startswith("http://localhost:8000")
        return "https://provider.example/consent"

    async def exchange_code(self, *, code, redirect_uri):
        assert code == "code"
        return TokenExchangeResponse(access_token="not-logged", refresh_token="refresh", external_shop_id="shop-1")


def test_authorize_redirects_to_provider(client):
    client.app.state.providers["tiktok_shop"] = ShopStub()
    response = client.get("/oauth/tiktok_shop/authorize", params={"state": "csrf-state-123", "redirect_uri": "http://localhost:8000/callback"}, follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "https://provider.example/consent"


def test_authorize_rejects_invalid_platform_or_redirect(client):
    assert client.get("/oauth/tiktok/authorize", params={"state": "csrf-state-123", "redirect_uri": "http://localhost:8000/callback"}).status_code == 404
    assert client.get("/oauth/shopee/authorize", params={"state": "short", "redirect_uri": "not-a-url"}).status_code == 422


def test_exchange_validates_url_platform_and_contract(client):
    client.app.state.providers["tiktok_shop"] = ShopStub()
    payload = {"platform": "tiktok_shop", "code": "code", "state": "csrf-state-123", "redirect_uri": "http://localhost:8000/callback"}
    response = client.post("/oauth/tiktok_shop/token-exchange", json=payload)
    assert response.status_code == 200
    assert response.json()["external_shop_id"] == "shop-1"
    payload["platform"] = "shopee"
    assert client.post("/oauth/tiktok_shop/token-exchange", json=payload).status_code == 422
