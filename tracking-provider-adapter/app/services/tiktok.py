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
        source_refs: dict[str, str] = {}
        unavailable: list[Metric] = []
        video_ids: list[str] = []
        for source_id in dict.fromkeys(request.post_ids):
            if source_id.isdecimal():
                video_ids.append(source_id)
                source_refs[source_id] = source_id
                continue
            # Content Posting returns a publish job ID, not a Display API
            # video ID. Resolve it without changing the post's privacy.
            status = await self.request(
                'POST', self.settings().tiktok_api_base_url.rstrip('/') + '/v2/post/publish/status/fetch/',
                json={'publish_id': source_id},
                headers={'Authorization': f'Bearer {request.access_token}', 'Content-Type': 'application/json'})
            public_ids = status.get('data', {}).get('publicaly_available_post_id', [])
            if not isinstance(public_ids, list) or len(public_ids) > 1:
                raise ProviderError(self.platform, 'publish job does not resolve to one attributable video')
            if not public_ids:
                # Private/pending/moderated posts do not expose a public video
                # ID. Preserve unavailable counters rather than inventing zero.
                unavailable.append(Metric(external_ref=f'tiktok:{source_id}', record_date=None))
                continue
            video_id = str(public_ids[0])
            if not video_id.isdecimal():
                raise ProviderError(self.platform, 'provider returned invalid video ID')
            video_ids.append(video_id)
            source_refs[video_id] = source_id
        cursor = 0
        videos: list[dict] = []
        # TikTok accepts at most 20 records per request.  The old max_count
        # of 100 can make the entire sync fail, leaving newly published Reels
        # with no metrics at all.
        for _ in range(0 if request.post_ids else 10):
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
        for offset in range(0, len(video_ids), 20):
            data = await self.request(
                'POST', self.settings().tiktok_api_base_url.rstrip('/') + '/v2/video/query/',
                params={'fields': fields}, json={'filters': {'video_ids': video_ids[offset:offset+20]}},
                headers={'Authorization': f'Bearer {request.access_token}', 'Content-Type': 'application/json'})
            videos.extend(data.get('data', {}).get('videos', []))
        metrics: list[Metric] = list(unavailable)
        for video in videos:
            record_date = provider_date(video.get("create_time"), request.from_date)
            if (not request.post_ids and not (request.from_date <= record_date <= request.to_date)) or not video.get("id"):
                continue
            likes, comments, shares = number(video.get("like_count")), number(video.get("comment_count")), number(video.get("share_count"))
            metrics.append(Metric(external_ref=f"tiktok:{source_refs.get(str(video['id']), str(video['id']))}", record_date=record_date,
                                  views=number(video["view_count"]) if "view_count" in video else None,
                                  likes=likes if "like_count" in video else None, comments=comments if "comment_count" in video else None, shares=shares if "share_count" in video else None,
                                  engagement=likes + comments + shares if all(k in video for k in ("like_count", "comment_count", "share_count")) else None))
        return metrics
