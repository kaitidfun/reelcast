from __future__ import annotations

from datetime import datetime, timezone

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date


class YouTubeProvider(ProviderClient):
    platform = "youtube"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("youtube_api_base_url")
        headers = {"Authorization": f"Bearer {request.access_token}"}
        published_after = datetime.combine(request.from_date, datetime.min.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        published_before = datetime.combine(request.to_date, datetime.max.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        search = await self.request("GET", self.settings().youtube_api_base_url.rstrip("/") + "/youtube/v3/search",
                                    params={"part": "snippet", "channelId": request.external_account_id, "type": "video",
                                            "publishedAfter": published_after, "publishedBefore": published_before, "maxResults": 50}, headers=headers)
        ids = [item.get("id", {}).get("videoId") for item in search.get("items", []) if item.get("id", {}).get("videoId")]
        if not ids:
            return []
        detail = await self.request("GET", self.settings().youtube_api_base_url.rstrip("/") + "/youtube/v3/videos",
                                    params={"part": "snippet,statistics", "id": ",".join(ids)}, headers=headers)
        return [Metric(external_ref=f"youtube:{item['id']}",
                       record_date=provider_date(item.get("snippet", {}).get("publishedAt"), request.from_date),
                       views=number(item.get("statistics", {}).get("viewCount")),
                       engagement=number(item.get("statistics", {}).get("likeCount")) + number(item.get("statistics", {}).get("commentCount")))
                for item in detail.get("items", []) if item.get("id")]
