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
        endpoint = self.settings().tiktok_api_base_url.rstrip("/") + "/v2/video/list/"
        cursor = 0
        videos: list[dict] = []
        # TikTok accepts at most 20 records per request.  The old max_count
        # of 100 can make the entire sync fail, leaving newly published Reels
        # with no metrics at all.
        for _ in range(10):
            data = await self.request(
                "POST", endpoint,
                params={"fields": fields},
                json={"max_count": 20, "cursor": cursor},
                headers={"Authorization": f"Bearer {request.access_token}", "Content-Type": "application/json"},
            )
            page = data.get("data", {})
            page_videos = page.get("videos", [])
            if not isinstance(page_videos, list):
                raise ProviderError(self.platform, "provider returned invalid videos")
            videos.extend(item for item in page_videos if isinstance(item, dict))
            if not page.get("has_more"):
                break
            next_cursor = page.get("cursor")
            if not isinstance(next_cursor, int) or next_cursor == cursor:
                break
            cursor = next_cursor
        metrics: list[Metric] = []
        for video in videos:
            record_date = provider_date(video.get("create_time"), request.from_date)
            if not (request.from_date <= record_date <= request.to_date) or not video.get("id"):
                continue
            likes, comments, shares = number(video.get("like_count")), number(video.get("comment_count")), number(video.get("share_count"))
            metrics.append(Metric(external_ref=f"tiktok:{video['id']}", record_date=record_date,
                                  views=number(video.get("view_count")), engagement=likes + comments + shares))
        return metrics
