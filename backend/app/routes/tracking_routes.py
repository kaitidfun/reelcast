"""Feature 5 - Data Tracking endpoints."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.models import User
from app.schemas.analytics import (
    EcommerceAccountConnect,
    EcommerceAccountResponse,
    TrackingMetricCreate,
)
from app.services import tracking_provider_service, tracking_service

router = APIRouter(prefix="/api/tracking", tags=["Data Tracking"])


@router.get("/ecommerce/accounts", response_model=list[EcommerceAccountResponse])
def list_ecommerce_accounts(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """F5-UC01: show only the requesting Member's connected stores."""
    return tracking_service.list_ecommerce_accounts(db, user_id=current_user.user_id)


@router.post(
    "/ecommerce/accounts", response_model=EcommerceAccountResponse, status_code=status.HTTP_201_CREATED,
)
def connect_ecommerce_account(
    payload: EcommerceAccountConnect,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """F5-UC01 OAuth callback target; tokens are encrypted at rest."""
    return tracking_service.upsert_ecommerce_account(
        db, user_id=current_user.user_id, **payload.model_dump(),
    )


@router.delete("/ecommerce/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_ecommerce_account(
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
def ingest_tracking_metric(
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
async def synchronize_tracking_data(
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
    return {"providers": tracking_provider_service.readiness()}


@router.get("/dashboard")
def get_tracking_dashboard(
    start: date | None = Query(None),
    end: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """F5-UC05/06: aggregated dashboard with Product, Campaign and Reel views."""
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start date must be before end date")
    return tracking_service.dashboard(db, user_id=current_user.user_id, start=start, end=end)
