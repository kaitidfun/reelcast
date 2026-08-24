"""Public outbound redirect endpoint for ReelCast commerce attribution."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services import outbound_tracking_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Outbound tracking"])


@router.get("/r/{token}", include_in_schema=False)
def redirect_outbound_link(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Resolve an opaque token, log an Outbound Click, then return HTTP 302.

    Logging is intentionally best-effort: once a valid target is resolved, an
    analytics database failure must never stop the user reaching Lazada.
    """
    try:
        link = outbound_tracking_service.get_by_token(db, token)
    except SQLAlchemyError:
        logger.exception("Unable to resolve outbound tracking token")
        raise HTTPException(status_code=503, detail="Link temporarily unavailable")

    if not link or not link.affiliate_url:
        raise HTTPException(status_code=404, detail="Tracked link not found")

    try:
        outbound_tracking_service.record_outbound_click(db, link=link, request=request)
    except Exception:
        # A transient commit/analytics failure must not degrade the redirect.
        db.rollback()
        logger.warning("Unable to record outbound click for token %s", token)

    return RedirectResponse(url=link.affiliate_url, status_code=302)
