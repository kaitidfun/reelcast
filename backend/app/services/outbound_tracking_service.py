"""Best-effort persistence for outbound click redirect requests."""

from __future__ import annotations

import hashlib

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import TRACKING_HASH_SECRET
from app.models.models import AttributionLink, OutboundClick


def get_by_token(db: Session, token: str) -> AttributionLink | None:
    return db.query(AttributionLink).filter(AttributionLink.token == token).first()


def _hash_client_ip(request: Request) -> str | None:
    client = request.client
    ip_address = client.host if client else None
    if not ip_address:
        return None
    return hashlib.sha256(f"{ip_address}{TRACKING_HASH_SECRET}".encode("utf-8")).hexdigest()


def record_outbound_click(db: Session, *, link: AttributionLink, request: Request) -> OutboundClick:
    """Record a redirect request. Callers deliberately swallow failures."""
    click = OutboundClick(
        attribution_link_id=link.attribution_link_id,
        referrer=request.headers.get("referer"),
        user_agent=request.headers.get("user-agent"),
        ip_hash=_hash_client_ip(request),
    )
    db.add(click)
    db.commit()
    db.refresh(click)
    return click
