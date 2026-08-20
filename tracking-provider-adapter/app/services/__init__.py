from app.services.facebook import FacebookProvider
from app.services.instagram import InstagramProvider
from app.services.lazada import LazadaProvider
from app.services.shopee import ShopeeProvider
from app.services.tiktok import TikTokProvider
from app.services.tiktok_shop import TikTokShopProvider
from app.services.youtube import YouTubeProvider


def provider_registry():
    return {
        "tiktok_shop": TikTokShopProvider(), "shopee": ShopeeProvider(), "lazada": LazadaProvider(),
        "tiktok": TikTokProvider(), "youtube": YouTubeProvider(), "facebook": FacebookProvider(),
        "instagram": InstagramProvider(),
    }
