from __future__ import annotations

import asyncio
import logging
import re

import httpx

from app.schemas import Metric, SyncRequest
from app.services.sync_policy import pooled_sync, optional_metrics, scope, warn, graph_cursor
from app.services.base import ProviderClient, ProviderError, provider_date


logger = logging.getLogger(__name__)


class FacebookProvider(ProviderClient):
    platform = "facebook"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def _reel_shares(self, video_id: str, headers: dict[str, str], client: httpx.AsyncClient) -> int | None:
        try:
            result = await self.request(
                'GET', f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{video_id}/video_insights",
                params={'metric': 'post_video_social_actions', 'period': 'lifetime'}, headers=headers, client=client)
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

    @optional_metrics(lambda: None)
    async def _video_shares(self, video_id: str, page_id: str, headers: dict[str, str], client: httpx.AsyncClient) -> int | None:
        count = await self._post_shares(video_id, page_id, headers, client)
        return count if count is not None else await self._reel_shares(video_id, headers, client)

    async def _post_shares(self, video_id: str, page_id: str, headers: dict[str, str], client: httpx.AsyncClient) -> int | None:
        # Meta exposes shares on the associated Post, not the Video node.
        # Resolve its real ID rather than constructing a Page/video combination.
        base_url = self.settings().facebook_graph_api_base_url.rstrip('/')
        try:
            video = await self.request('GET', f'{base_url}/{video_id}',
                                       params={'fields': 'post_id'}, headers=headers, client=client)
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
                                      params={'fields': 'id,shares'}, headers=headers, client=client)
        except ProviderError as exc:
            # This optional lookup must not discard successfully fetched video counters.
            # Log only the safe status, never tokens or provider response bodies.
            logger.warning('Facebook video shares unavailable (status=%s)', exc.status_code)
            return None
        shares = post.get('shares')
        count = shares.get('count') if isinstance(shares, dict) else None
        return count if isinstance(count, int) and not isinstance(count, bool) and count >= 0 else None

    @pooled_sync
    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("facebook_graph_api_base_url")
        # Keep the pool local to this sync: provider instances are shared by
        # concurrent requests and must never retain another account's session.
        return await self._sync(request, scope.get().client)

    async def _sync(self, request: SyncRequest, client: httpx.AsyncClient) -> list[Metric]:
        fields = "id,created_time,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares"
        headers = {"Authorization": f"Bearer {request.access_token}"}
        posts: list[dict] = []
        if request.post_ids:
            async def fetch_post(post_id: str) -> dict:
                # Distribution stores the uploaded Video ID. A Page post ID
                # contains an underscore and supports a different set of fields.
                node_fields = fields if '_' in post_id else 'id,created_time,views,likes.limit(0).summary(true),comments.limit(0).summary(true)'
                item = await self.request('GET', f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{post_id}",
                                          params={'fields': node_fields}, headers=headers, client=client)
                if '_' not in post_id:
                    count = await self._video_shares(post_id, request.external_account_id, headers, client)
                    if count is not None:
                        item['shares'] = {'count': count}
                return item

            post_ids = list(dict.fromkeys(request.post_ids))
            for start in range(0, len(post_ids), getattr(self.settings(), 'sync_concurrency', 4)):
                # Bound provider load, preserve order and finish all tasks in a
                # batch before closing the session or reporting a failure.
                results = await asyncio.gather(*(fetch_post(post_id) for post_id in post_ids[start:start + getattr(self.settings(), 'sync_concurrency', 4)]),
                                               return_exceptions=True)
                if results and all(isinstance(result, BaseException) for result in results):
                    raise results[0]
                for result in results:
                    if isinstance(result, BaseException):
                        if isinstance(result, ProviderError) and result.status_code in {400, 404, 502, 503, 504}:
                            warn('Some posts are unavailable; previous observations were retained')
                            continue
                        raise result
                    posts.append(result)
        else:
            data = await self.request("GET", f"{self.settings().facebook_graph_api_base_url.rstrip('/')}/{request.external_account_id}/posts",
                                      params={"fields": fields, "since": request.from_date.isoformat(), "until": request.to_date.isoformat(), "limit": 100,
                                              **({'after': request.page_cursor} if request.page_cursor is not None else {})}, headers=headers, client=client)
            posts: list[dict] = []
            # A Page feed is paginated.  Without following its cursor, a new Reel
            # can disappear behind older posts and never enter Tracking.
            for _ in range(10):
                page = data.get("data", [])
                if not isinstance(page, list):
                    raise ProviderError(self.platform, "provider returned invalid posts")
                posts.extend(item for item in page if isinstance(item, dict))
                if request.single_page:
                    scope.get().next_cursor = graph_cursor(data)
                    break
                next_url = data.get("paging", {}).get("next")
                if not isinstance(next_url, str) or not next_url:
                    break
                data = await self.request("GET", next_url, headers=headers, client=client)
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
