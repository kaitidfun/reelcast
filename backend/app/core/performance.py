"""Request/SQL timing without logging query text, tokens, or request bodies."""
from contextvars import ContextVar
from dataclasses import dataclass
import logging
from time import perf_counter
from uuid import uuid4

from sqlalchemy import event

logger = logging.getLogger("reelcast.performance")


def configure_performance_logging():
    logger.setLevel(logging.INFO)
    if not logger.hasHandlers():
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s %(message)s'))
        logger.addHandler(handler)


@dataclass
class QueryTiming:
    count: int = 0
    seconds: float = 0.0


request_queries: ContextVar[QueryTiming | None] = ContextVar("request_queries", default=None)


def install_sql_timing(engine):
    if getattr(engine, "_reelcast_timing", False):
        return
    engine._reelcast_timing = True

    @event.listens_for(engine, "before_cursor_execute")
    def before(_conn, _cursor, _statement, _parameters, context, _many):
        context._reelcast_started = perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after(_conn, _cursor, _statement, _parameters, context, _many):
        timing = request_queries.get()
        if timing is not None:
            timing.count += 1
            timing.seconds += perf_counter() - context._reelcast_started


class PerformanceMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        timing = QueryTiming()
        token = request_queries.set(timing)
        started = perf_counter()
        request_id = uuid4().hex
        status = 500

        async def timed_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                elapsed = (perf_counter() - started) * 1000
                message = dict(message)
                message["headers"] = list(message.get("headers", [])) + [
                    (b"server-timing", f"app;dur={elapsed:.2f}, db;dur={timing.seconds * 1000:.2f}".encode()),
                    (b"x-request-id", request_id.encode()),
                ]
            await send(message)

        try:
            await self.app(scope, receive, timed_send)
        finally:
            route = scope.get("route")
            # Route templates avoid logging OAuth codes, IDs, or tracking codes.
            logger.info(
                "request id=%s method=%s route=%s status=%s total_ms=%.2f sql_count=%s sql_ms=%.2f",
                request_id, scope["method"], getattr(route, "path", "unmatched"), status,
                (perf_counter() - started) * 1000, timing.count, timing.seconds * 1000,
            )
            request_queries.reset(token)
