"""Request-scoped, credential-free policies for social statistics reads."""
from __future__ import annotations

import asyncio
from contextvars import ContextVar
from dataclasses import dataclass, field
from functools import wraps
import logging
from time import monotonic

import httpx

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())


@dataclass
class SyncScope:
    client: httpx.AsyncClient
    deadline: float
    semaphore: asyncio.Semaphore
    warnings: set[str] = field(default_factory=set)
    next_cursor: str | int | None = None
    attempts: int = 0


scope: ContextVar[SyncScope | None] = ContextVar('social_sync_scope', default=None)
optional: ContextVar[bool] = ContextVar('social_optional_metrics', default=False)


def warn(reason='Some optional metrics are unavailable'):
    current = scope.get()
    if current is not None:
        current.warnings.add(reason)


def graph_cursor(data):
    paging = data.get('paging') or {}
    if not paging.get('next'):
        return None
    cursor = (paging.get('cursors') or {}).get('after')
    if not isinstance(cursor, str) or not cursor or len(cursor) > 2048:
        from app.services.base import ProviderError
        raise ProviderError('meta', 'provider returned an invalid pagination cursor', 400)
    return cursor


def pooled_sync(function):
    @wraps(function)
    async def run(self, request):
        # Route and direct provider invocations share the same safe lifecycle.
        if scope.get() is not None:
            return await function(self, request)
        from app.services.base import ProviderError
        settings = self.settings()
        budget = min(getattr(settings, 'sync_timeout_seconds', 24.0), request.timeout_seconds)
        async with self.client() as client:
            token = scope.set(SyncScope(client, monotonic() + budget,
                                       asyncio.Semaphore(getattr(settings, 'sync_concurrency', 4))))
            started = monotonic()
            try:
                return await asyncio.wait_for(function(self, request), timeout=budget)
            except asyncio.TimeoutError as exc:
                error = ProviderError(self.platform, 'sync deadline exceeded', 504)
                error.retry_exhausted = True
                raise error from exc
            finally:
                logger.info('social_sync platform=%s duration_ms=%.2f warnings=%s',
                            self.platform, (monotonic() - started) * 1000, len(scope.get().warnings))
                # The route receives warnings via its own outer scope (below).
                scope.reset(token)
    return run


async def run_sync(provider, request):
    """Return results and partial-data warnings without storing account state on providers."""
    settings = provider.settings()
    budget = min(getattr(settings, 'sync_timeout_seconds', 24.0), request.timeout_seconds)
    async with provider.client() as client:
        current = SyncScope(client, monotonic() + budget,
                            asyncio.Semaphore(getattr(settings, 'sync_concurrency', 4)))
        token = scope.set(current)
        started = monotonic()
        outcome = 'failed'
        try:
            try:
                metrics = await asyncio.wait_for(provider.sync(request), timeout=budget)
            except asyncio.TimeoutError as exc:
                from app.services.base import ProviderError
                error = ProviderError(provider.platform, 'sync deadline exceeded', 504)
                error.retry_exhausted = True
                raise error from exc
            outcome = 'partial' if current.warnings else 'completed'
            return metrics, sorted(current.warnings), current.next_cursor
        finally:
            logger.info('social_sync platform=%s outcome=%s duration_ms=%.2f attempts=%s warnings=%s',
                        provider.platform, outcome, (monotonic() - started) * 1000,
                        current.attempts, len(current.warnings))
            scope.reset(token)


def optional_metrics(fallback):
    def decorate(function):
        @wraps(function)
        async def run(self, *args, **kwargs):
            from app.services.base import ProviderError
            current = scope.get()
            budget = min(getattr(self.settings(), 'optional_timeout_seconds', 5.0),
                         max(0.01, current.deadline - monotonic()) if current else 5.0)
            token = optional.set(True)
            try:
                return await asyncio.wait_for(function(self, *args, **kwargs), timeout=budget)
            except (ProviderError, asyncio.TimeoutError):
                warn()
                return fallback()
            finally:
                optional.reset(token)
        return run
    return decorate
