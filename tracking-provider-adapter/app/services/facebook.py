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
        headers = {"Authorization": f"Bearer {request.access_token}"}
        data = await self.request("GET", f"{self.settings().meta_graph_api_base_url.rstrip('/')}/{request.external_account_id}/posts",
                                  params={"fields": fields, "since": request.from_date.isoformat(), "until": request.to_date.isoformat(), "limit": 100}, headers=headers)
        posts: list[dict] = []
        # A Page feed is paginated.  Without following its cursor, a new Reel
        # can disappear behind older posts and never enter Tracking.
        for _ in range(10):
            page = data.get("data", [])
            if not isinstance(page, list):
                raise ProviderError(self.platform, "provider returned invalid posts")
            posts.extend(item for item in page if isinstance(item, dict))
            next_url = data.get("paging", {}).get("next")
            if not isinstance(next_url, str) or not next_url:
                break
            data = await self.request("GET", next_url, headers=headers)
        metrics: list[Metric] = []
        for post in posts:
            if not post.get("id"):
                continue
            insight = {entry.get("name"): _insight_number((entry.get("values") or [{}])[0].get("value")) for entry in post.get("insights", {}).get("data", [])}
            metrics.append(Metric(external_ref=f"facebook:{post['id']}", record_date=provider_date(post.get("created_time"), request.from_date),
                                  views=insight.get("post_impressions", 0), clicks=insight.get("post_clicks", 0),
                                  engagement=insight.get("post_reactions_by_type_total", 0)))
        return metrics


def _insight_number(value) -> int:
    """Meta reaction insight is a type-to-count map, unlike other metrics."""
    if isinstance(value, dict):
        return sum(number(item) for item in value.values())
    return number(value)
