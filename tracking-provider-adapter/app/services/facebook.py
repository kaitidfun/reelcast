from __future__ import annotations

import logging
import re

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, provider_date


logger = logging.getLogger(__name__)


class FacebookProvider(ProviderClient):
    platform = "facebook"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def _reel_shares(self, video_id: str, headers: dict[str, str]) -> int | None:
        try:
            result = await self.request(
                'GET', f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{video_id}/video_insights",
                params={'metric': 'post_video_social_actions', 'period': 'lifetime'}, headers=headers)
        except ProviderError as exc:
            logger.warning('Facebook Reel shares unavailable (status=%s)', exc.status_code)
            return None
        data = result.get('data')
        if not isinstance(data, list):
            return None
        for metric in data:
            if not isinstance(metric, dict) or metric.get('name') != 'post_video_social_actions' or metric.get('period') != 'lifetime':
                continue
            values = metric.get('values')
            if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], dict):
                return None
            actions = values[0].get('value')
            if not isinstance(actions, dict):
                return None
            # A returned lifetime action breakdown is sparse: {} means no actions.
            # An absent metric/values or a rejected request is unavailable, not zero.
            if any(key not in {'share', 'comment', 'reaction'} for key in actions):
                return None
            if any(not isinstance(value, int) or isinstance(value, bool) or value < 0
                   for value in actions.values()):
                return None
            return actions.get('share', 0)
        return None

    async def _video_shares(self, video_id: str, page_id: str, headers: dict[str, str]) -> int | None:
        count = await self._post_shares(video_id, page_id, headers)
        return count if count is not None else await self._reel_shares(video_id, headers)

    async def _post_shares(self, video_id: str, page_id: str, headers: dict[str, str]) -> int | None:
        # Meta exposes shares on the associated Post, not the Video node.
        # Resolve its real ID rather than constructing a Page/video combination.
        base_url = self.settings().facebook_graph_api_base_url.rstrip('/')
        try:
            video = await self.request('GET', f'{base_url}/{video_id}',
                                       params={'fields': 'post_id'}, headers=headers)
            post_id = video.get('post_id')
            if not isinstance(post_id, str) or not re.fullmatch(r'\d+(?:_\d+)?', post_id):
                return None
            if '_' not in post_id:
                # A bare Post ID hits Meta's retired singular-status endpoint.
                # Use the connected Page plus the actual resolved Post ID (not Video ID).
                if not re.fullmatch(r'\d+', page_id):
                    return None
                post_id = f'{page_id}_{post_id}'
            post = await self.request('GET', f'{base_url}/{post_id}',
                                      params={'fields': 'id,shares'}, headers=headers)
        except ProviderError as exc:
            # This optional lookup must not discard successfully fetched video counters.
            # Log only the safe status, never tokens or provider response bodies.
            logger.warning('Facebook video shares unavailable (status=%s)', exc.status_code)
            return None
        shares = post.get('shares')
        count = shares.get('count') if isinstance(shares, dict) else None
        return count if isinstance(count, int) and not isinstance(count, bool) and count >= 0 else None

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("facebook_graph_api_base_url")
        fields = "id,created_time,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares"
        headers = {"Authorization": f"Bearer {request.access_token}"}
        posts: list[dict] = []
        if request.post_ids:
            for post_id in dict.fromkeys(request.post_ids):
                # Distribution stores the uploaded Video ID. A Page post ID
                # contains an underscore and supports a different set of fields.
                node_fields = fields if '_' in post_id else 'id,created_time,views,likes.limit(0).summary(true),comments.limit(0).summary(true)'
                item = await self.request('GET', f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{post_id}",
                                          params={'fields': node_fields}, headers={'Authorization': f'Bearer {request.access_token}'})
                if '_' not in post_id:
                    count = await self._video_shares(post_id, request.external_account_id, headers)
                    if count is not None:
                        item['shares'] = {'count': count}
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
            is_video = bool(request.post_ids and '_' not in str(post['id']))
            likes = post.get('likes', {}).get('summary', {}).get('total_count') if is_video else None
            engagement_parts = (likes, comments) if is_video else (reactions, comments, shares)
            metrics.append(Metric(
                external_ref=f"facebook:{post['id']}",
                record_date=provider_date(post.get('created_time'), request.from_date),
                views=post.get('views') if is_video else None, likes=likes, comments=comments, shares=shares,
                engagement=sum(engagement_parts) if all(v is not None for v in engagement_parts) else None))
        return metrics
