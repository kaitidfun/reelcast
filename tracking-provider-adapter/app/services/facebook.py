from __future__ import annotations

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date


class FacebookProvider(ProviderClient):
    platform = "facebook"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("facebook_graph_api_base_url")
        fields = "id,created_time,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares"
        headers = {"Authorization": f"Bearer {request.access_token}"}
        posts: list[dict] = []
        if request.post_ids:
            for post_id in dict.fromkeys(request.post_ids):
                item = await self.request('GET', f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{post_id}",
                                          params={'fields': fields}, headers={'Authorization': f'Bearer {request.access_token}'})
                posts.append(item)
        else:
            data = await self.request("GET", f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{request.external_account_id}/posts",
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
            reactions = post.get('reactions', {}).get('summary', {}).get('total_count')
            comments = post.get('comments', {}).get('summary', {}).get('total_count')
            shares = post.get('shares', {}).get('count')
            metrics.append(Metric(
                external_ref=f"facebook:{post['id']}",
                record_date=provider_date(post.get('created_time'), request.from_date),
                views=None, comments=comments, shares=shares,
                engagement=sum((reactions, comments, shares)) if all(v is not None for v in (reactions, comments, shares)) else None))
        return metrics
