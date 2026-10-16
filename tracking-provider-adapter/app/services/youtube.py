from __future__ import annotations

from datetime import datetime, timezone
import logging

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date

logger = logging.getLogger(__name__)


class YouTubeProvider(ProviderClient):
    platform = "youtube"

    async def _shares(self, request: SyncRequest, ids: list[str], headers: dict[str, str]) -> dict[str, int]:
        if not ids:
            return {}
        try:
            report = await self.request(
                "GET", self.settings().youtube_analytics_api_base_url.rstrip("/") + "/v2/reports",
                params={"ids": f"channel=={request.external_account_id}",
                        # Include older published videos, not just the discovery window.
                        "startDate": "2005-01-01", "endDate": request.to_date.isoformat(),
                        "metrics": "shares", "dimensions": "video",
                        "filters": "video==" + ",".join(ids), "maxResults": len(ids)},
                headers=headers)
        except ProviderError as exc:
            # Old connections may lack Analytics consent. Keep Data API counters.
            logger.warning('YouTube shares unavailable (status=%s)', exc.status_code)
            return {}
        columns = report.get("columnHeaders")
        rows = report.get("rows")
        if not isinstance(columns, list) or not isinstance(rows, list):
            return {}
        names = [column.get("name") if isinstance(column, dict) else None for column in columns]
        if names.count("video") != 1 or names.count("shares") != 1:
            return {}
        video_index, shares_index = names.index("video"), names.index("shares")
        result = {}
        for row in rows:
            if not isinstance(row, list) or len(row) != len(columns):
                continue
            video, count = row[video_index], row[shares_index]
            if (isinstance(video, str) and video in ids and isinstance(count, int)
                    and not isinstance(count, bool) and count >= 0):
                result[video] = count
        # Missing rows (including newly published videos) are not measured zeros.
        return result

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("youtube_api_base_url")
        headers = {"Authorization": f"Bearer {request.access_token}"}
        published_after = datetime.combine(request.from_date, datetime.min.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        published_before = datetime.combine(request.to_date, datetime.max.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        search_url = self.settings().youtube_api_base_url.rstrip("/") + "/youtube/v3/search"
        page_token: str | None = None
        ids: list[str] = list(request.post_ids)
        # Explicit date ordering makes a just-published Short visible on the
        # first sync instead of relying on YouTube's relevance ordering.
        for _ in range(0 if request.post_ids else 10):
            params = {"part": "snippet", "channelId": request.external_account_id, "type": "video",
                      "publishedAfter": published_after, "publishedBefore": published_before,
                      "maxResults": 50, "order": "date"}
            if page_token:
                params["pageToken"] = page_token
            search = await self.request("GET", search_url, params=params, headers=headers)
            ids.extend(
                item.get("id", {}).get("videoId")
                for item in search.get("items", [])
                if item.get("id", {}).get("videoId")
            )
            page_token = search.get("nextPageToken")
            if not isinstance(page_token, str) or not page_token:
                break
        ids = list(dict.fromkeys(ids))
        if not ids:
            return []
        metrics: list[Metric] = []
        for start in range(0, len(ids), 50):
            detail = await self.request("GET", self.settings().youtube_api_base_url.rstrip("/") + "/youtube/v3/videos",
                                        params={"part": "snippet,statistics", "id": ",".join(ids[start:start + 50])}, headers=headers)
            shares = await self._shares(request, [item['id'] for item in detail.get('items', []) if item.get('id')], headers)
            metrics.extend(
                Metric(external_ref=f"youtube:{item['id']}",
                       record_date=provider_date(item.get("snippet", {}).get("publishedAt"), request.from_date),
                       views=number(item["statistics"]["viewCount"]) if "viewCount" in item.get("statistics", {}) else None,
                       likes=number(item["statistics"]["likeCount"]) if "likeCount" in item.get("statistics", {}) else None,
                       comments=number(item["statistics"]["commentCount"]) if "commentCount" in item.get("statistics", {}) else None,
                       shares=shares.get(item['id']),
                       engagement=number(item.get("statistics", {}).get("likeCount")) + number(item.get("statistics", {}).get("commentCount")) if all(k in item.get("statistics", {}) for k in ("likeCount", "commentCount")) else None)
                for item in detail.get("items", []) if item.get("id")
            )
        return metrics
