from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode, urlparse

from app.schemas import Metric, SyncRequest, TokenExchangeResponse
from app.services.base import ProviderClient, ProviderError, amount, provider_date, unix_start


class TikTokShopProvider(ProviderClient):
    platform = "tiktok_shop"

    def _signature(self, path: str, params: dict[str, str], body: str = "") -> str:
        """TikTok Shop v202309 HMAC signature (excludes sign/access_token)."""
        secret = self.settings().tiktok_shop_app_secret
        signing_params = {key: value for key, value in params.items() if key not in {"sign", "access_token"}}
        material = path + "".join(f"{key}{signing_params[key]}" for key in sorted(signing_params)) + body
        wrapped = f"{secret}{material}{secret}"
        return hmac.new(secret.encode(), wrapped.encode(), hashlib.sha256).hexdigest()

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        self.require("tiktok_shop_authorize_url", "tiktok_shop_app_key", "tiktok_shop_app_secret")
        return f"{self.settings().tiktok_shop_authorize_url}?{urlencode({'app_key': self.settings().tiktok_shop_app_key, 'state': state, 'redirect_uri': redirect_uri})}"

    async def exchange_code(self, *, code: str, redirect_uri: str) -> TokenExchangeResponse:
        self.require("tiktok_shop_token_url", "tiktok_shop_app_key", "tiktok_shop_app_secret")
        timestamp = str(int(time.time()))
        path = urlparse(self.settings().tiktok_shop_token_url).path
        params = {"app_key": self.settings().tiktok_shop_app_key, "timestamp": timestamp}
        params["sign"] = self._signature(path, params)
        data = await self.request("POST", self.settings().tiktok_shop_token_url, params=params,
                                  json={"auth_code": code, "grant_type": "authorized_code", "redirect_uri": redirect_uri})
        result = data.get("data", data)
        token = result.get("access_token")
        shop_id = result.get("shop_id") or result.get("seller_id")
        if not token or not shop_id:
            raise ProviderError(self.platform, "provider token response did not include a shop identifier")
        return TokenExchangeResponse(access_token=str(token), refresh_token=result.get("refresh_token"),
                                     external_shop_id=str(shop_id), shop_name=result.get("shop_name"))

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("tiktok_shop_api_base_url", "tiktok_shop_app_key", "tiktok_shop_app_secret")
        path = "/order/202309/orders/search"
        timestamp = str(int(time.time()))
        params = {"app_key": self.settings().tiktok_shop_app_key, "timestamp": timestamp}
        body = {"page_size": 100, "create_time_ge": unix_start(request.from_date),
                "create_time_lt": unix_start(request.to_date) + 86400}
        # JSON compact encoding is required because the signed bytes and sent bytes must agree.
        import json
        raw_body = json.dumps(body, separators=(",", ":"))
        params["sign"] = self._signature(path, params, raw_body)
        data = await self.request("POST", self.settings().tiktok_shop_api_base_url.rstrip("/") + path,
                                  params=params, json=body,
                                  headers={"x-tts-access-token": request.access_token, "Content-Type": "application/json"})
        response = data.get("data", data)
        orders = response.get("orders", [])
        if not isinstance(orders, list):
            raise ProviderError(self.platform, "provider returned invalid orders")
        return [Metric(external_ref=f"tiktok_shop:{item.get('id') or item.get('order_id')}",
                       record_date=provider_date(item.get("create_time") or item.get("create_time_iso"), request.from_date),
                       orders=1, revenue=amount(item.get("payment") or item.get("order_amount") or item.get("total_amount")))
                for item in orders if item.get("id") or item.get("order_id")]
