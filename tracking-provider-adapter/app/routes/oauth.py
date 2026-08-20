from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import HttpUrl

from app.schemas import TokenExchangeRequest, TokenExchangeResponse
from app.services.base import ProviderError

router = APIRouter(prefix="/oauth", tags=["oauth"])
SHOP_PLATFORMS = {"tiktok_shop", "shopee", "lazada"}


def _provider(request, platform: str):
    if platform not in SHOP_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported shop platform")
    return request.app.state.providers[platform]


@router.get("/{platform}/authorize")
async def authorize(platform: str, request: Request, state: str = Query(min_length=8, max_length=1024),
                    redirect_uri: HttpUrl = Query()):
    provider = _provider(request, platform)
    try:
        return RedirectResponse(provider.authorization_url(state=state, redirect_uri=str(redirect_uri)), status_code=302)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=f"{exc.platform}: {exc.reason}") from exc


@router.post("/{platform}/token-exchange", response_model=TokenExchangeResponse)
async def token_exchange(platform: str, payload: TokenExchangeRequest, request: Request):
    if payload.platform != platform:
        raise HTTPException(status_code=422, detail="platform must match the URL")
    provider = _provider(request, platform)
    try:
        return await provider.exchange_code(code=payload.code, redirect_uri=str(payload.redirect_uri))
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=f"{exc.platform}: {exc.reason}") from exc
