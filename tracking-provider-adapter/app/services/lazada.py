from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

from app.schemas import Metric, SyncRequest, TokenExchangeResponse
from app.services.base import ProviderClient, ProviderError, amount, provider_date


class LazadaProvider(ProviderClient):
    platform = "lazada"

    def _sign(self, path: str, params: dict[str, str]) -> str:
        material = path + "".join(f"{key}{params[key]}" for key in sorted(params) if key != "sign")
        return hmac.new(self.settings().lazada_app_secret.encode(), material.encode(), hashlib.sha256).hexdigest().upper()

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        self.require("lazada_authorize_url", "lazada_app_key", "lazada_app_secret")
        return f"{self.settings().lazada_authorize_url}?{urlencode({'response_type': 'code', 'client_id': self.settings().lazada_app_key, 'redirect_uri': redirect_uri, 'state': state})}"

    async def exchange_code(self, *, code: str, redirect_uri: str) -> TokenExchangeResponse:
        self.require("lazada_token_url", "lazada_app_key", "lazada_app_secret")
        path = "/auth/token/create"
        params = {"app_key": self.settings().lazada_app_key, "sign_method": "sha256", "timestamp": str(int(time.time() * 1000))}
        params["sign"] = self._sign(path, params)
        data = await self.request("POST", self.settings().lazada_token_url, params=params,
                                  data={"code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri})
        token = data.get("access_token")
        info = data.get("country_user_info") or []
        user = info[0] if isinstance(info, list) and info else {}
        shop_id = data.get("seller_id") or data.get("account_id") or user.get("user_id")
        if not token or not shop_id:
            raise ProviderError(self.platform, "provider token response did not include a shop identifier")
        return TokenExchangeResponse(access_token=str(token), refresh_token=data.get("refresh_token"),
                                     external_shop_id=str(shop_id), shop_name=user.get("seller_name") or user.get("name"))

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("lazada_api_base_url", "lazada_app_key", "lazada_app_secret")
        path = "/orders/get"
        params = {"app_key": self.settings().lazada_app_key, "sign_method": "sha256", "timestamp": str(int(time.time() * 1000)),
                  "access_token": request.access_token, "created_after": request.from_date.isoformat() + "T00:00:00+00:00",
                  "created_before": request.to_date.isoformat() + "T23:59:59+00:00", "limit": "100"}
        params["sign"] = self._sign(path, params)
        data = await self.request("GET", self.settings().lazada_api_base_url.rstrip("/") + path, params=params)
        orders = data.get("data", {}).get("orders", data.get("orders", []))
        if not isinstance(orders, list):
            raise ProviderError(self.platform, "provider returned invalid orders")
        return [Metric(external_ref=f"lazada:{item.get('order_id')}",
                       record_date=provider_date(item.get("created_at"), request.from_date), orders=1,
                       revenue=amount(item.get("order_price") or item.get("price")))
                for item in orders if item.get("order_id")]
