from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Settings are intentionally read only from the adapter environment."""

    # Resolve files from this service's directory, not the shell's working
    # directory.  Local overrides mirror the backend's `.env.local` setup.
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / ".env.local"),
        extra="ignore",
    )

    port: int = 9000
    request_timeout_seconds: float = 15.0

    adapter_key_tiktok_shop: str = ""
    adapter_key_shopee: str = ""
    adapter_key_lazada: str = ""
    adapter_key_tiktok: str = ""
    adapter_key_youtube: str = ""
    adapter_key_facebook: str = ""
    adapter_key_instagram: str = ""

    tiktok_shop_app_key: str = ""
    tiktok_shop_app_secret: str = ""
    shopee_app_key: str = ""
    shopee_app_secret: str = ""
    shopee_shop_id: str = ""
    lazada_app_key: str = ""
    lazada_app_secret: str = ""
    # Kept configurable so deployments can select the provider region/version
    # without changing code.  The .env.example contains the current defaults.
    tiktok_shop_api_base_url: str = ""
    tiktok_shop_authorize_url: str = ""
    tiktok_shop_token_url: str = ""
    shopee_api_base_url: str = ""
    shopee_authorize_url: str = ""
    lazada_api_base_url: str = ""
    lazada_authorize_url: str = ""
    lazada_token_url: str = ""
    tiktok_api_base_url: str = ""
    youtube_api_base_url: str = ""
    meta_graph_api_base_url: str = ""

    @property
    def adapter_keys(self) -> dict[str, str]:
        return {
            "tiktok_shop": self.adapter_key_tiktok_shop,
            "shopee": self.adapter_key_shopee,
            "lazada": self.adapter_key_lazada,
            "tiktok": self.adapter_key_tiktok,
            "youtube": self.adapter_key_youtube,
            "facebook": self.adapter_key_facebook,
            "instagram": self.adapter_key_instagram,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
