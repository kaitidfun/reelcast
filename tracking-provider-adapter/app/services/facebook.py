from __future__ import annotations

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date


class FacebookProvider(ProviderClient):
    platform = "facebook"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("meta_graph_api_base_url")
        fields = "id,created_time,insights.metric(post_impressions,post_clicks,post_reactions_by_type_total)"
        data = await self.request("GET", f"{self.settings().meta_graph_api_base_url.rstrip('/')}/{request.external_account_id}/posts",
                                  params={"fields": fields, "since": request.from_date.isoformat(), "until": request.to_date.isoformat()},
                                  headers={"Authorization": f"Bearer {request.access_token}"})
        posts = data.get("data", [])
        if not isinstance(posts, list):
            raise ProviderError(self.platform, "provider returned invalid posts")
        metrics: list[Metric] = []
        for post in posts:
            if not post.get("id"):
                continue
            insight = {entry.get("name"): number((entry.get("values") or [{}])[0].get("value")) for entry in post.get("insights", {}).get("data", [])}
            metrics.append(Metric(external_ref=f"facebook:{post['id']}", record_date=provider_date(post.get("created_time"), request.from_date),
                                  views=insight.get("post_impressions", 0), clicks=insight.get("post_clicks", 0),
                                  engagement=insight.get("post_reactions_by_type_total", 0)))
        return metrics
