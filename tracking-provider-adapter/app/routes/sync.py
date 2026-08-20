from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.security import verify_adapter_key
from app.schemas import SyncRequest, SyncResponse
from app.services.base import ProviderError

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/{platform}", response_model=SyncResponse)
async def sync(platform: str, payload: SyncRequest, request: Request,
               adapter_key: str | None = Header(None, alias="X-ReelCast-Adapter-Key")):
    if payload.platform != platform:
        raise HTTPException(status_code=422, detail="platform must match the URL")
    if platform not in request.app.state.providers:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    verify_adapter_key(platform, adapter_key)
    try:
        return SyncResponse(metrics=await request.app.state.providers[platform].sync(payload))
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=f"{exc.platform}: {exc.reason}") from exc
