from __future__ import annotations

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date


class TikTokProvider(ProviderClient):
    platform = "tiktok"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("tiktok_api_base_url")
        fields = "id,create_time,like_count,comment_count,share_count,view_count"
        data = await self.request("POST", self.settings().tiktok_api_base_url.rstrip("/") + "/v2/video/list/",
                                  params={"fields": fields}, json={"max_count": 100},
                                  headers={"Authorization": f"Bearer {request.access_token}", "Content-Type": "application/json"})
        videos = data.get("data", {}).get("videos", [])
        if not isinstance(videos, list):
            raise ProviderError(self.platform, "provider returned invalid videos")
        metrics: list[Metric] = []
        for video in videos:
            record_date = provider_date(video.get("create_time"), request.from_date)
            if not (request.from_date <= record_date <= request.to_date) or not video.get("id"):
                continue
            likes, comments, shares = number(video.get("like_count")), number(video.get("comment_count")), number(video.get("share_count"))
            metrics.append(Metric(external_ref=f"tiktok:{video['id']}", record_date=record_date,
                                  views=number(video.get("view_count")), engagement=likes + comments + shares))
        return metrics
