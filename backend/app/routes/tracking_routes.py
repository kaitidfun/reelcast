"""Feature 5 - Data Tracking endpoints."""

from __future__ import annotations

import secrets
import urllib.parse
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.core.config import ALGORITHM, BACKEND_URL, FRONTEND_URL, SECRET_KEY
from app.models.models import Campaign, Product, User
from app.schemas.analytics import (
    EcommerceAccountConnect,
    EcommerceAccountResponse,
    TrackingMetricCreate,
)
from app.services import tracking_provider_service, tracking_service

router = APIRouter(prefix="/api/tracking", tags=["Data Tracking"])

_SHOP_SESSION_USER_KEY = "reelcast_shop_connect_user_id"
_SHOP_SESSION_STATE_KEY = "reelcast_shop_connect_state"
_SHOP_SESSION_PLATFORM_KEY = "reelcast_shop_connect_platform"


def _tracking_error_redirect(message: str) -> RedirectResponse:
    return RedirectResponse(url=f"{FRONTEND_URL}/tracking?error={urllib.parse.quote(message)}")


def _validate_tracking_filters(
    db: Session,
    *,
    user_id: UUID,
    platform: str | None,
    campaign_id: UUID | None,
    product_id: UUID | None,
) -> None:
    if platform and platform not in tracking_service.SUPPORTED_TRACKING_PLATFORMS:
        raise HTTPException(status_code=422, detail="Unsupported tracking platform")
    if campaign_id and not db.query(Campaign.campaign_id).filter(
        Campaign.campaign_id == campaign_id,
        Campaign.user_id == user_id,
        Campaign.deleted_at.is_(None),
    ).first():
        raise HTTPException(status_code=404, detail="Campaign not found")
    if product_id and not db.query(Product.product_id).filter(
        Product.product_id == product_id,
        Product.user_id == user_id,
        Product.deleted_at.is_(None),
    ).first():
        raise HTTPException(status_code=404, detail="Product not found")


@router.get("/ecommerce/accounts", response_model=list[EcommerceAccountResponse])
def list_ecommerce_accounts(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """F5-UC01: show only the requesting Member's connected stores."""
    return tracking_service.list_ecommerce_accounts(db, user_id=current_user.user_id)


@router.post(
    "/ecommerce/accounts", response_model=EcommerceAccountResponse, status_code=status.HTTP_201_CREATED,
)
def connectEcommerceAccountManually(
    payload: EcommerceAccountConnect,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Direct token-entry path — not reachable from the UI, which only uses
    connectEcommerceAccount/ecommerceAccountCallback (the real OAuth
    redirect flow UC01 describes). Kept for manually seeding a ShopAccount
    when a provider's OAuth app isn't registered yet. Tokens are encrypted
    at rest either way.
    """
    return tracking_service.upsert_ecommerce_account(
        db, user_id=current_user.user_id, **payload.model_dump(),
    )


@router.get("/ecommerce/{platform}/connect")
def connectEcommerceAccount(
    platform: str,
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    """Start F5-UC01 from the card UI; credentials never enter the browser."""
    if platform not in {"tiktok_shop", "shopee", "lazada"}:
        return _tracking_error_redirect("Unsupported e-commerce platform")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") not in (None, "access"):
            return _tracking_error_redirect("Invalid or expired session")
        email = payload.get("sub")
    except JWTError:
        return _tracking_error_redirect("Invalid or expired session")
    user = db.query(User).filter(User.email == email).first() if email else None
    if not user:
        return _tracking_error_redirect("Invalid or expired session")

    state = secrets.token_urlsafe(16)
    request.session[_SHOP_SESSION_USER_KEY] = str(user.user_id)
    request.session[_SHOP_SESSION_STATE_KEY] = state
    request.session[_SHOP_SESSION_PLATFORM_KEY] = platform
    redirect_uri = f"{BACKEND_URL}/api/tracking/ecommerce/{platform}/callback"
    try:
        return RedirectResponse(
            url=tracking_provider_service.build_authorize_url(
                platform, state=state, redirect_uri=redirect_uri,
            )
        )
    except tracking_provider_service.TrackingProviderError as exc:
        request.session.clear()
        return _tracking_error_redirect(str(exc))


@router.get("/ecommerce/{platform}/callback")
async def ecommerceAccountCallback(
    platform: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Exchange provider code through the configured server-side adapter."""
    if error:
        return _tracking_error_redirect(f"{platform} authorization was cancelled or denied")
    expected_state = request.session.pop(_SHOP_SESSION_STATE_KEY, None)
    expected_platform = request.session.pop(_SHOP_SESSION_PLATFORM_KEY, None)
    user_id = request.session.pop(_SHOP_SESSION_USER_KEY, None)
    if not user_id or not code or not state or state != expected_state or platform != expected_platform:
        return _tracking_error_redirect("Connection session expired - please try connecting again")

    redirect_uri = f"{BACKEND_URL}/api/tracking/ecommerce/{platform}/callback"
    try:
        tokens = await tracking_provider_service.exchange_authorization_code(
            platform, code=code, state=state, redirect_uri=redirect_uri,
        )
        tracking_service.upsert_ecommerce_account(
            db,
            user_id=UUID(user_id),
            platform_name=platform,
            external_shop_id=tokens["external_shop_id"],
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            shop_name=tokens["shop_name"],
        )
    except tracking_provider_service.TrackingProviderError as exc:
        return _tracking_error_redirect(str(exc))
    return RedirectResponse(url=f"{FRONTEND_URL}/tracking?connected={platform}")


@router.delete("/ecommerce/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnectEcommerceAccount(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """F5-UC02: disconnect a store without affecting another Member's data."""
    if not tracking_service.delete_ecommerce_account(
        db, account_id=account_id, user_id=current_user.user_id,
    ):
        raise HTTPException(status_code=404, detail="E-commerce account not found")


@router.post("/metrics", status_code=status.HTTP_201_CREATED)
def ingestTrackingMetric(
    payload: TrackingMetricCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Provider-adapter endpoint for the normalized results of an F5 sync."""
    try:
        return tracking_service.record_metric(
            db, user_id=current_user.user_id, **payload.model_dump(),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sync")
async def synchronizeTrackingData(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """F5-UC03/F5-UC04: synchronize configured shop and social adapters."""
    return await tracking_provider_service.sync_member(db, user_id=current_user.user_id)


@router.get("/readiness")
def tracking_readiness(
    current_user: User = Depends(get_current_user),
):
    """Expose only which provider adapters are configured, never their secrets."""
    del current_user
    return {
        "providers": tracking_provider_service.readiness(),
        "oauth": tracking_provider_service.oauth_readiness(),
    }


@router.get("/dashboard")
def getTrackingDashboard(
    start: date | None = Query(None),
    end: date | None = Query(None),
    platform: str | None = None,
    campaign_id: UUID | None = None,
    product_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """F5-UC05: display only the Member's filtered, synchronized tracking data."""
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start date must be before end date")
    _validate_tracking_filters(
        db, user_id=current_user.user_id, platform=platform,
        campaign_id=campaign_id, product_id=product_id,
    )
    return tracking_service.dashboard(
        db, user_id=current_user.user_id, start=start, end=end, platform=platform,
        campaign_id=campaign_id, product_id=product_id,
    )


@router.get("/analysis")
def analyzeTrackingPerformance(
    level: str = Query(...),
    metric: str = Query(...),
    start: date | None = Query(None),
    end: date | None = Query(None),
    platform: str | None = None,
    campaign_id: UUID | None = None,
    product_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """F5-UC06: rank and trend a Member's selected performance scope and metric."""
    if level not in tracking_service.ANALYSIS_LEVELS:
        raise HTTPException(status_code=422, detail="Unsupported analysis level")
    if metric not in tracking_service.ANALYSIS_METRICS:
        raise HTTPException(status_code=422, detail="Unsupported analysis metric")
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start date must be before end date")
    _validate_tracking_filters(
        db, user_id=current_user.user_id, platform=platform,
        campaign_id=campaign_id, product_id=product_id,
    )
    return tracking_service.analyze_performance(
        db, user_id=current_user.user_id, level=level, metric=metric,
        start=start, end=end, platform=platform, campaign_id=campaign_id,
        product_id=product_id,
    )


@router.get("/filter-options")
def trackingFilterOptions(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Owned filter values for UC05/06; IDs from another Member are never exposed."""
    campaigns = db.query(Campaign).filter(
        Campaign.user_id == current_user.user_id, Campaign.deleted_at.is_(None),
    ).order_by(Campaign.name).all()
    products = db.query(Product).filter(
        Product.user_id == current_user.user_id, Product.deleted_at.is_(None),
    ).order_by(Product.product_name).all()
    return {
        "platforms": sorted(tracking_service.SUPPORTED_TRACKING_PLATFORMS),
        "campaigns": [{"id": str(item.campaign_id), "name": item.name} for item in campaigns],
        "products": [{"id": str(item.product_id), "name": item.product_name} for item in products],
    }
