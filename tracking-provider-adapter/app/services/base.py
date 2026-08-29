from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas import Metric, SyncRequest, TokenExchangeResponse


logger = logging.getLogger(__name__)


class ProviderError(Exception):
    def __init__(self, platform: str, reason: str, status_code: int = 502):
        self.platform, self.reason, self.status_code = platform, reason, status_code
        super().__init__(f"{platform}: {reason}")


class ProviderClient(ABC):
    platform: str

    @abstractmethod
    def authorization_url(self, *, state: str, redirect_uri: str) -> str: ...

    async def exchange_code(self, *, code: str, redirect_uri: str) -> TokenExchangeResponse:
        raise ProviderError(self.platform, "OAuth token exchange is not supported", 422)

    @abstractmethod
    async def sync(self, request: SyncRequest) -> list[Metric]: ...

    def settings(self):
        return get_settings()

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self.settings().request_timeout_seconds)

    async def request(self, method: str, url: str, *, params: dict[str, Any] | None = None,
                      json: dict[str, Any] | None = None, data: dict[str, Any] | None = None,
                      headers: dict[str, str] | None = None) -> dict[str, Any]:
        """Translate transport/provider errors into safe API errors; never include bodies."""
        try:
            async with self.client() as client:
                response = await client.request(method, url, params=params, json=json, data=data, headers=headers)
        except httpx.TimeoutException as exc:
            raise ProviderError(self.platform, "provider request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(self.platform, "provider request failed") from exc
        if response.status_code == 429:
            raise ProviderError(self.platform, "provider rate limit reached", 429)
        if response.status_code in (401, 403):
            raise ProviderError(self.platform, "provider rejected the access token", 401)
        if response.is_error:
            logger.warning(
                "[Tracking adapter] Provider HTTP error: platform=%s status=%s",
                self.platform, response.status_code,
            )
            raise ProviderError(self.platform, "provider returned an error")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError(self.platform, "provider returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise ProviderError(self.platform, "provider returned an invalid response")
        # Several providers use HTTP 200 for an application-level failure.
        # Inspect only status codes, never echo their message (it can contain account data).
        error = payload.get("error")
        if isinstance(error, str) and error:
            logger.warning(
                "[Tracking adapter] Provider payload error: platform=%s status=%s code=%s",
                self.platform, response.status_code, "string-error",
            )
            raise ProviderError(self.platform, "provider returned an error")
        if isinstance(error, dict) and error.get("code") not in (None, 0, "0", "ok", "OK"):
            logger.warning(
                "[Tracking adapter] Provider payload error: platform=%s status=%s code=%s",
                self.platform, response.status_code, str(error["code"])[:64],
            )
            raise ProviderError(self.platform, "provider returned an error")
        if "code" in payload and payload["code"] not in (None, 0, "0", "ok", "OK"):
            logger.warning(
                "[Tracking adapter] Provider payload error: platform=%s status=%s code=%s",
                self.platform, response.status_code, str(payload["code"])[:64],
            )
            raise ProviderError(self.platform, "provider returned an error")
        return payload

    def require(self, *names: str) -> None:
        missing = [name for name in names if not getattr(self.settings(), name)]
        if missing:
            raise ProviderError(self.platform, f"missing provider configuration: {', '.join(missing)}", 503)


def number(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def amount(value: Any) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def provider_date(value: Any, fallback: date) -> date:
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc).date()
        except (OverflowError, OSError, ValueError):
            return fallback
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            pass
    return fallback


def unix_start(value: date) -> int:
    """UTC midnight timestamp; portable on Windows as well as POSIX."""
    return int(datetime(value.year, value.month, value.day, tzinfo=timezone.utc).timestamp())
