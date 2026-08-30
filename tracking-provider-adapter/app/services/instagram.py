from __future__ import annotations

from app.schemas import Metric, SyncRequest
from app.services.base import ProviderClient, ProviderError, number, provider_date


class InstagramProvider(ProviderClient):
    platform = "instagram"

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        del state, redirect_uri
        raise ProviderError(self.platform, "OAuth is managed by ReelCast", 422)

    async def sync(self, request: SyncRequest) -> list[Metric]:
        self.require("meta_graph_api_base_url")
        # Likes/comments are media fields. Asking for them inside the
        # insights expansion is invalid for current Instagram Graph versions
        # and causes the whole account sync to fail.
        fields = "id,timestamp,media_type,like_count,comments_count"
        data = await self.request("GET", f"{self.settings().meta_graph_api_base_url.rstrip('/')}/{request.external_account_id}/media",
                                  params={"fields": fields, "since": request.from_date.isoformat(), "until": request.to_date.isoformat(), "limit": 100},
                                  headers={"Authorization": f"Bearer {request.access_token}"})
        media: list[dict] = []
        headers = {"Authorization": f"Bearer {request.access_token}"}
        for _ in range(10):
            page = data.get("data", [])
            if not isinstance(page, list):
                raise ProviderError(self.platform, "provider returned invalid media")
            media.extend(item for item in page if isinstance(item, dict))
            next_url = data.get("paging", {}).get("next")
            if not isinstance(next_url, str) or not next_url:
                break
            data = await self.request("GET", next_url, headers=headers)
        metrics: list[Metric] = []
        for item in media:
            if not item.get("id"):
                continue
            # Image/carousel posts do not support Reel insight metrics.  Keep
            # their basic engagement rather than failing the full sync.
            is_video = item.get("media_type") in {"REELS", "VIDEO"}
            insight = await self._media_insights(str(item["id"]), headers) if is_video else {}
            metrics.append(Metric(external_ref=f"instagram:{item['id']}", record_date=provider_date(item.get("timestamp"), request.from_date),
                                  views=insight.get("views", insight.get("plays", insight.get("reach", 0))),
                                  engagement=number(item.get("like_count")) + number(item.get("comments_count")) + insight.get("shares", 0) + insight.get("saved", 0)))
        return metrics

    async def _media_insights(self, media_id: str, headers: dict[str, str]) -> dict[str, int]:
        """Read Reel insight metrics separately from basic media metadata."""
        base_url = self.settings().meta_graph_api_base_url.rstrip("/")
        try:
            data = await self.request("GET", f"{base_url}/{media_id}/insights",
                                      params={"metric": "views,reach,shares,saved"}, headers=headers)
        except ProviderError:
            # Some older Graph versions expose plays rather than views.  Keep
            # the Reel in Tracking even while Facebook rolls out that change.
            try:
                data = await self.request("GET", f"{base_url}/{media_id}/insights",
                                          params={"metric": "plays,reach,shares,saved"}, headers=headers)
            except ProviderError:
                # Existing connections granted before the insights scope was
                # added can still contribute their public like/comment counts
                # until the member reconnects and grants the new permission.
                return {}
        return {
            entry.get("name"): number((entry.get("values") or [{}])[0].get("value"))
            for entry in data.get("data", [])
            if isinstance(entry, dict) and entry.get("name")
        }
