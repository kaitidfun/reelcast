from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
import logging
import asyncio
import random
from time import monotonic
from urllib.parse import urlsplit
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas import Metric, SyncRequest, TokenExchangeResponse
from app.services.sync_policy import scope, optional, warn


logger = logging.getLogger(__name__)


class ProviderError(Exception):
    def __init__(self, platform: str, reason: str, status_code: int = 502, *, retry_after: float | None = None):
        self.platform, self.reason, self.status_code = platform, reason, status_code
        self.retry_after = retry_after
        self.retry_exhausted = False
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
        return httpx.AsyncClient(timeout=httpx.Timeout(self.settings().request_timeout_seconds, connect=5, pool=3),
                                 limits=httpx.Limits(max_connections=4, max_keepalive_connections=4))

    async def request(self, method: str, url: str, *, params: dict[str, Any] | None = None,
                      json: dict[str, Any] | None = None, data: dict[str, Any] | None = None,
                      headers: dict[str, str] | None = None,
                      client: httpx.AsyncClient | None = None) -> dict[str, Any]:
        """Retry only allowlisted statistics reads, within one absolute deadline."""
        current = scope.get()
        client = client or (current.client if current else None)
        read_only = method == 'GET' or (self.platform == 'tiktok' and method == 'POST'
            and urlsplit(url).path in {'/v2/video/list/', '/v2/video/query/', '/v2/post/publish/status/fetch/'})
        attempts = getattr(self.settings(), 'read_attempts', 3) if current and read_only and not optional.get() else 1
        for attempt in range(attempts):
            try:
                async def send(active_client):
                    if current:
                        current.attempts += 1
                    return await active_client.request(method, url, params=params, json=json, data=data, headers=headers)
                if current:
                    async with current.semaphore:
                        response = await send(client)
                elif client is not None:
                    response = await send(client)
                else:
                    async with self.client() as owned_client:
                        response = await send(owned_client)
                return self._payload(response)
            except httpx.TimeoutException:
                error = ProviderError(self.platform, 'provider request timed out', 504)
            except httpx.HTTPError:
                error = ProviderError(self.platform, 'provider request failed', 502)
            except ProviderError as exc:
                error = exc
            if optional.get():
                warn()
            # Rate limits are deferred to the queue; never sleep for a long
            # Retry-After inside an adapter request. No nested worker HTTP retry.
            if error.status_code not in {502, 503, 504} or attempt + 1 == attempts:
                error.retry_exhausted = bool(current and read_only and not optional.get()
                                             and error.status_code in {502, 503, 504})
                raise error
            delay = random.uniform(0, min(2.0, 0.5 * 2 ** attempt))
            if current.deadline - monotonic() <= delay + 0.5:
                error.retry_exhausted = True
                raise error
            await asyncio.sleep(delay)

    def _payload(self, response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError:
            payload = None
        error = payload.get('error') if isinstance(payload, dict) else None
        code = error.get('code') if isinstance(error, dict) else None
        reasons = {str(entry.get('reason')) for entry in error.get('errors', []) if isinstance(entry, dict)} if isinstance(error, dict) and isinstance(error.get('errors'), list) else set()
        if isinstance(payload, dict) and 'code' in payload:
            code = payload['code']
        code = str(code) if code is not None else None
        if response.status_code == 429 or code in {'4', '17', '32', '613', '80001', 'rate_limit_exceeded'} or reasons & {'quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'}:
            try:
                delay = max(0, float(response.headers.get('Retry-After', '60')))
            except ValueError:
                from email.utils import parsedate_to_datetime
                try:
                    delay = max(0, (parsedate_to_datetime(response.headers['Retry-After']) - datetime.now(timezone.utc)).total_seconds())
                except (ValueError, TypeError, KeyError, OverflowError):
                    delay = 60
            raise ProviderError(self.platform, 'provider rate limit reached', 429, retry_after=delay)
        if response.status_code == 401 or code in {'190', 'access_token_invalid'}:
            raise ProviderError(self.platform, 'provider rejected the access token', 401)
        if response.status_code == 403 or code in {'10', '200', 'scope_not_authorized', 'scope_permission_missed'}:
            raise ProviderError(self.platform, 'provider permission is missing', 403)
        if response.is_error:
            status = response.status_code if response.status_code in {400, 404, 503, 504} else 502
            if 400 <= response.status_code < 500:
                status = response.status_code
            logger.warning('provider_error platform=%s status=%s', self.platform, response.status_code)
            raise ProviderError(self.platform, 'provider returned an error', status)
        if not isinstance(payload, dict):
            raise ProviderError(self.platform, 'provider returned an invalid response')
        failed = (isinstance(error, str) and bool(error)) or (isinstance(error, dict) and error.get('code') not in (None, 0, '0', 'ok', 'OK')) or ('code' in payload and payload['code'] not in (None, 0, '0', 'ok', 'OK'))
        if failed:
            # Only known categorical codes may reach logs, never arbitrary
            # provider strings, messages, URLs, query strings or credentials.
            safe_code = code if code in {'INVALID_TOKEN', 'internal_error', 'invalid_params'} else 'provider-error'
            logger.warning('provider_error platform=%s code=%s', self.platform, safe_code)
            raise ProviderError(self.platform, 'provider returned an error', 400 if code == 'invalid_params' else 502)
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
