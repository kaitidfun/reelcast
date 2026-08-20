from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode, urlparse

from app.schemas import Metric, SyncRequest, TokenExchangeResponse
from app.services.base import ProviderClient, ProviderError, amount, provider_date, unix_start


class ShopeeProvider(ProviderClient):
    platform = "shopee"

    def _sign(self, path: str, timestamp: int, access_token: str = "", shop_id: str = "") -> str:
        settings = self.settings()
        base = f"{settings.shopee_app_key}{path}{timestamp}{access_token}{shop_id}"
        return hmac.new(settings.shopee_app_secret.encode(), base.encode(), hashlib.sha256).hexdigest()

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        # Shopee returns shop_id as a callback query parameter; ReelCast should retain it in the
        # authorization code hand-off or configure SHOPEE_SHOP_ID for a single-shop integration.
        self.require("shopee_authorize_url", "shopee_app_key", "shopee_app_secret")
        timestamp = int(time.time())
        path = urlparse(self.settings().shopee_authorize_url).path
        params = {"partner_id": self.settings().shopee_app_key, "timestamp": timestamp,
                  "redirect": redirect_uri, "state": state}
        params["sign"] = self._sign(path, timestamp)
        return f"{self.settings().shopee_authorize_url}?{urlencode(params)}"

    async def exchange_code(self, *, code: str, redirect_uri: str) -> TokenExchangeResponse:
        del redirect_uri
        self.require("shopee_api_base_url", "shopee_app_key", "shopee_app_secret", "shopee_shop_id")
        path = "/api/v2/auth/token/get"
        data = await self.request("POST", self.settings().shopee_api_base_url.rstrip("/") + path, json={
            "partner_id": int(self.settings().shopee_app_key), "partner_key": self.settings().shopee_app_secret,
            "shop_id": int(self.settings().shopee_shop_id), "code": code,
        })
        token = data.get("access_token")
        if not token:
            raise ProviderError(self.platform, "provider token response did not include an access token")
        return TokenExchangeResponse(access_token=str(token), refresh_token=data.get("refresh_token"),
                                     external_shop_id=str(data.get("shop_id") or self.settings().shopee_shop_id),
                                     shop_name=data.get("shop_name"))

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("shopee_api_base_url", "shopee_app_key", "shopee_app_secret")
        path = "/api/v2/order/get_order_list"
        timestamp = int(time.time())
        params = {"partner_id": self.settings().shopee_app_key, "timestamp": timestamp,
                  "access_token": request.access_token, "shop_id": request.external_account_id,
                  "time_range_field": "create_time", "time_from": unix_start(request.from_date),
                  "time_to": unix_start(request.to_date) + 86400, "page_size": 100}
        params["sign"] = self._sign(path, timestamp, request.access_token, request.external_account_id)
        data = await self.request("GET", self.settings().shopee_api_base_url.rstrip("/") + path, params=params)
        entries = data.get("response", {}).get("order_list", [])
        if not isinstance(entries, list):
            raise ProviderError(self.platform, "provider returned invalid orders")
        # The list endpoint provides stable IDs. Detailed revenue can be added by enabling the
        # permitted order-detail scope; do not make an N+1 call on every sync.
        return [Metric(external_ref=f"shopee:{item.get('order_sn')}",
                       record_date=provider_date(item.get("create_time"), request.from_date), orders=1,
                       revenue=amount(item.get("total_amount"))) for item in entries if item.get("order_sn")]
