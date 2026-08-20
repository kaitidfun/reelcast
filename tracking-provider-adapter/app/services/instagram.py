from __future__ import annotations

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date


class InstagramProvider(ProviderClient):
    platform = "instagram"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("meta_graph_api_base_url")
        fields = "id,timestamp,media_type,insights.metric(impressions,reach,likes,comments,shares,saved)"
        data = await self.request("GET", f"{self.settings().meta_graph_api_base_url.rstrip('/')}/{request.external_account_id}/media",
                                  params={"fields": fields, "since": request.from_date.isoformat(), "until": request.to_date.isoformat()},
                                  headers={"Authorization": f"Bearer {request.access_token}"})
        media = data.get("data", [])
        if not isinstance(media, list):
            raise ProviderError(self.platform, "provider returned invalid media")
        metrics: list[Metric] = []
        for item in media:
            if not item.get("id"):
                continue
            insight = {entry.get("name"): number((entry.get("values") or [{}])[0].get("value")) for entry in item.get("insights", {}).get("data", [])}
            metrics.append(Metric(external_ref=f"instagram:{item['id']}", record_date=provider_date(item.get("timestamp"), request.from_date),
                                  views=insight.get("impressions", insight.get("reach", 0)),
                                  engagement=sum(insight.get(key, 0) for key in ("likes", "comments", "shares", "saved"))))
        return metrics
