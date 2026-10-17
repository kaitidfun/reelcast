from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.security import verify_adapter_key
from app.schemas import SyncRequest, SyncResponse
from app.services.base import ProviderError
from app.services.sync_policy import run_sync

router = APIRouter(prefix="/sync", tags=["sync"])
logger = logging.getLogger(__name__)


@router.post("/{platform}", response_model=SyncResponse)
async def sync(platform: str, payload: SyncRequest, request: Request,
               adapter_key: str | None = Header(None, alias="X-ReelCast-Adapter-Key")):
    if payload.platform != platform:
        raise HTTPException(status_code=422, detail="platform must match the URL")
    if platform not in request.app.state.providers:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    verify_adapter_key(platform, adapter_key)
    try:
        provider = request.app.state.providers[platform]
        if hasattr(provider, 'settings'):
            metrics, warnings, next_cursor = await run_sync(provider, payload)
            return SyncResponse(metrics=metrics, warnings=warnings, next_cursor=next_cursor)
        return SyncResponse(metrics=await provider.sync(payload))
    except ProviderError as exc:
        logger.warning(
            "[Tracking adapter] Sync failed: platform=%s status=%s reason=%s",
            exc.platform, exc.status_code, exc.reason,
        )
        headers = {'Retry-After': str(int(exc.retry_after))} if exc.retry_after is not None else {}
        if exc.retry_exhausted:
            headers['X-ReelCast-Retry-Exhausted'] = '1'
        raise HTTPException(status_code=exc.status_code, detail=f"{exc.platform}: {exc.reason}", headers=headers) from exc
