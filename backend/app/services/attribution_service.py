"""Commerce attribution link creation and distribution-specific captions."""

from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from app.core.config import TRACKING_BASE_URL
from app.models.models import AttributionLink, Distribution, Product, Reel


AFFILIATE_NETWORK_LAZADA = "lazada"
ROUTE_TYPE_DIRECT_LINK = "direct_link"

# These are the limits enforced by the existing publishing adapters. Keeping
# the tracked URL inside the adapter's payload is especially important for
# TikTok's title and YouTube's description, which are sliced before upload.
_PLATFORM_CAPTION_LIMITS = {
    "tiktok": 150,
    "youtube": 4900,
    "instagram": 2200,
}


def get_or_create_distribution_link(
    db: Session,
    *,
    product: Product,
    reel: Reel,
    distribution: Distribution,
    platform: str,
) -> AttributionLink:
    """Return the MVP's one Lazada direct link for a distribution.

    The schema supports more links later, while this lookup makes retries use
    the exact URL already placed in the originally published caption.
    """
    existing = (
        db.query(AttributionLink)
        .filter(
            AttributionLink.distribution_id == distribution.distribution_id,
            AttributionLink.affiliate_network == AFFILIATE_NETWORK_LAZADA,
            AttributionLink.route_type == ROUTE_TYPE_DIRECT_LINK,
        )
        .first()
    )
    if existing:
        return existing

    token = secrets.token_urlsafe(18)
    platform_slug = (platform or "social").lower().replace("_", "-")
    link = AttributionLink(
        product_id=product.product_id,
        reel_id=reel.reel_id,
        distribution_id=distribution.distribution_id,
        platform=platform,
        affiliate_network=AFFILIATE_NETWORK_LAZADA,
        affiliate_url=product.affiliate_link,
        sub_id=f"rc_{platform_slug}_{secrets.token_urlsafe(12)}",
        route_type=ROUTE_TYPE_DIRECT_LINK,
        token=token,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def tracked_url(link: AttributionLink) -> str:
    return f"{TRACKING_BASE_URL}/r/{link.token}"


def platform_caption_limit(platform: str) -> int | None:
    return _PLATFORM_CAPTION_LIMITS.get((platform or "").lower())


def append_tracked_url(caption: str, url: str, *, max_length: int | None = None) -> str:
    """Put a distribution-only commerce CTA before the Reel's source caption."""
    base_caption = (caption or "").strip()
    commerce_cta = f"🛒 Shop here:\n{url}"
    if max_length is not None:
        # Reserve the CTA first: a truncated URL is a broken redirect.
        remaining_caption_length = max_length - len(commerce_cta) - 2
        if remaining_caption_length <= 0:
            return commerce_cta[:max_length]
        base_caption = base_caption[:remaining_caption_length].rstrip()
    return f"{commerce_cta}\n\n{base_caption}".strip()
