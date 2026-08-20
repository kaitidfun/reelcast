from __future__ import annotations

import hmac

from fastapi import HTTPException, status

from app.core.config import get_settings


def verify_adapter_key(platform: str, presented_key: str | None) -> None:
    """Authenticate backend-to-adapter calls without timing leakage."""
    expected_key = get_settings().adapter_keys.get(platform, "")
    if not expected_key or not presented_key or not hmac.compare_digest(expected_key, presented_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid adapter key")
