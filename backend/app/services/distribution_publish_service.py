"""
Platform Publish Service (Feature 3 — Multi-Platform Distribution)
====================================================================
Uploads a finished Reel to each connected platform's API.

Every function here takes a decrypted access token and the Reel's public
video URL — never the SocialAccount ORM object — so encryption/decryption
stays confined to social_account_service, not spread across this module.

Built to each platform's documented API contract (see F3 research notes),
but none of this has run against a live platform yet — TIKTOK/META/YOUTUBE
client credentials are unset until those dev apps are registered
(app/core/config.py). The first real distribution is the actual test.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable

import httpx

from app.exceptions import DistributionPublishException

logger = logging.getLogger(__name__)

_TIMEOUT = 60
_IG_POLL_ATTEMPTS = 10
_IG_POLL_INTERVAL_SECONDS = 3
_TIKTOK_UPLOAD_CHUNK_BYTES = 10 * 1024 * 1024
_TIKTOK_MIN_CHUNK_BYTES = 5 * 1024 * 1024


def _tiktok_response_error(payload: dict) -> str | None:
    """Return TikTok's API-level error even when it arrived with HTTP 200."""
    error = payload.get("error") or {}
    if error.get("code") and error["code"] != "ok":
        return error.get("message") or error["code"]
    return None


def _tiktok_upload_chunks(video: bytes) -> Iterable[tuple[int, bytes]]:
    """Yield compliant sequential chunks for TikTok's FILE_UPLOAD endpoint."""
    if not video:
        raise DistributionPublishException("TikTok video is empty")

    if len(video) <= _TIKTOK_MIN_CHUNK_BYTES:
        yield 0, video
        return

    chunks = [
        video[offset : offset + _TIKTOK_UPLOAD_CHUNK_BYTES]
        for offset in range(0, len(video), _TIKTOK_UPLOAD_CHUNK_BYTES)
    ]
    # TikTok permits a final chunk larger than chunk_size, but not a trailing
    # chunk below 5 MB. Merge that tail into its predecessor.
    if len(chunks) > 1 and len(chunks[-1]) < _TIKTOK_MIN_CHUNK_BYTES:
        chunks[-2] += chunks.pop()

    offset = 0
    for chunk in chunks:
        yield offset, chunk
        offset += len(chunk)


async def publish_to_tiktok(access_token: str, video_url: str, caption: str) -> str:
    """
    TikTok Content Posting API — Direct Post via FILE_UPLOAD.

    ReelCast stores generated videos in R2, whose host is not necessarily the
    verified TikTok URL property. Uploading the bytes avoids a fragile
    PULL_FROM_URL dependency on a particular R2/ngrok hostname.

    Sandbox and unaudited apps are limited by TikTok to SELF_ONLY. We query
    creator_info first, as required by the Direct Post flow, and only post if
    the creator currently permits that option.
    """
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            video_response = await client.get(video_url)
            video_response.raise_for_status()
            video_bytes = video_response.content
            mime_type = video_response.headers.get("content-type", "video/mp4").split(";", 1)[0]
            if mime_type not in {"video/mp4", "video/quicktime", "video/webm"}:
                mime_type = "video/mp4"

            creator_response = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json={},
            )
            creator_response.raise_for_status()
            creator_payload = creator_response.json()
            creator_error = _tiktok_response_error(creator_payload)
            if creator_error:
                raise DistributionPublishException(f"TikTok creator info failed: {creator_error}")
            privacy_options = creator_payload.get("data", {}).get("privacy_level_options", [])
            if "SELF_ONLY" not in privacy_options:
                raise DistributionPublishException(
                    "TikTok did not allow SELF_ONLY for this creator; reconnect the account and try again"
                )

            chunks = list(_tiktok_upload_chunks(video_bytes))
            init_response = await client.post(
                "https://open.tiktokapis.com/v2/post/publish/video/init/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json={
                    "post_info": {
                        "title": caption[:2200],
                        "privacy_level": "SELF_ONLY",
                        "disable_comment": False,
                        "disable_duet": False,
                        "disable_stitch": False,
                    },
                    "source_info": {
                        "source": "FILE_UPLOAD",
                        "video_size": len(video_bytes),
                        "chunk_size": min(_TIKTOK_UPLOAD_CHUNK_BYTES, len(video_bytes)),
                        "total_chunk_count": len(chunks),
                    },
                },
            )
            init_response.raise_for_status()
            init_payload = init_response.json()
            init_error = _tiktok_response_error(init_payload)
            if init_error:
                raise DistributionPublishException(f"TikTok publish failed: {init_error}")
            init_data = init_payload.get("data", {})
            publish_id = init_data.get("publish_id")
            upload_url = init_data.get("upload_url")
            if not publish_id or not upload_url:
                raise DistributionPublishException("TikTok did not return a publish_id and upload_url")

            total_size = len(video_bytes)
            for offset, chunk in chunks:
                upload_response = await client.put(
                    upload_url,
                    headers={
                        "Content-Type": mime_type,
                        "Content-Length": str(len(chunk)),
                        "Content-Range": f"bytes {offset}-{offset + len(chunk) - 1}/{total_size}",
                    },
                    content=chunk,
                )
                upload_response.raise_for_status()
        return publish_id
    except httpx.HTTPError as exc:
        raise DistributionPublishException(f"TikTok publish failed: {exc}") from exc


async def publish_to_youtube(access_token: str, video_url: str, caption: str) -> str:
    """
    YouTube Data API v3 videos.insert (resumable upload). Vertical + <60s +
    "#Shorts" in the title auto-classifies the upload as a Short — there's
    no separate Shorts endpoint.

    Downloads the Reel first since resumable upload needs actual bytes, not
    a URL — unlike TikTok's PULL_FROM_URL or Facebook/Instagram's file_url.
    """
    first_line = caption.splitlines()[0] if caption else "New Reel"
    title = f"{first_line[:90]} #Shorts"
    description = caption[:4900]

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            video_resp = await client.get(video_url)
            video_resp.raise_for_status()
            video_bytes = video_resp.content

            init_resp = await client.post(
                "https://www.googleapis.com/upload/youtube/v3/videos"
                "?uploadType=resumable&part=snippet,status",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                    "X-Upload-Content-Type": "video/mp4",
                },
                json={
                    "snippet": {"title": title, "description": description},
                    "status": {"privacyStatus": "private"},
                },
            )
            init_resp.raise_for_status()
            upload_url = init_resp.headers.get("Location")
            if not upload_url:
                raise DistributionPublishException("YouTube did not return a resumable upload URL")

            upload_resp = await client.put(
                upload_url,
                headers={"Content-Type": "video/mp4"},
                content=video_bytes,
            )
        upload_resp.raise_for_status()
        video_id = upload_resp.json().get("id")
        if not video_id:
            raise DistributionPublishException("YouTube upload did not return a video id")
        return video_id
    except httpx.HTTPError as exc:
        raise DistributionPublishException(f"YouTube publish failed: {exc}") from exc


async def publish_to_facebook(access_token: str, page_id: str, video_url: str, caption: str) -> str:
    """Facebook Page video upload. Reels only publish to a Page — personal profiles and Groups aren't supported by the API."""
    if not page_id:
        raise DistributionPublishException(
            "No Facebook Page id on this connection — reconnect the account"
        )
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"https://graph.facebook.com/v21.0/{page_id}/videos",
                data={
                    "file_url": video_url,
                    "description": caption,
                    "access_token": access_token,
                },
            )
        resp.raise_for_status()
        post_id = resp.json().get("id")
        if not post_id:
            raise DistributionPublishException(f"Facebook did not return a post id: {resp.text[:200]}")
        return post_id
    except httpx.HTTPError as exc:
        raise DistributionPublishException(f"Facebook publish failed: {exc}") from exc


async def publish_to_instagram(access_token: str, ig_user_id: str, video_url: str, caption: str) -> str:
    """
    Instagram Graph API Reels — container flow: create a media container,
    poll until Instagram finishes processing it, then publish it. Only
    Instagram Business accounts support this; Personal/Creator accounts
    can't publish via the API at all.
    """
    if not ig_user_id:
        raise DistributionPublishException(
            "No Instagram Business account id on this connection — reconnect the account"
        )
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            container_resp = await client.post(
                f"https://graph.facebook.com/v21.0/{ig_user_id}/media",
                data={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption,
                    "access_token": access_token,
                },
            )
            container_resp.raise_for_status()
            creation_id = container_resp.json().get("id")
            if not creation_id:
                raise DistributionPublishException("Instagram did not return a container id")

            for _ in range(_IG_POLL_ATTEMPTS):
                await asyncio.sleep(_IG_POLL_INTERVAL_SECONDS)
                status_resp = await client.get(
                    f"https://graph.facebook.com/v21.0/{creation_id}",
                    params={"fields": "status_code", "access_token": access_token},
                )
                status_resp.raise_for_status()
                if status_resp.json().get("status_code") == "FINISHED":
                    break
            else:
                raise DistributionPublishException("Instagram container did not finish processing in time")

            publish_resp = await client.post(
                f"https://graph.facebook.com/v21.0/{ig_user_id}/media_publish",
                data={"creation_id": creation_id, "access_token": access_token},
            )
        publish_resp.raise_for_status()
        media_id = publish_resp.json().get("id")
        if not media_id:
            raise DistributionPublishException("Instagram did not return a published media id")
        return media_id
    except httpx.HTTPError as exc:
        raise DistributionPublishException(f"Instagram publish failed: {exc}") from exc


async def publish(platform: str, *, access_token: str, external_account_id: str | None, video_url: str, caption: str) -> str:
    """Dispatch to the right platform's publish function. Returns the platform's post/video id."""
    if platform == "tiktok":
        return await publish_to_tiktok(access_token, video_url, caption)
    if platform == "youtube":
        return await publish_to_youtube(access_token, video_url, caption)
    if platform == "facebook":
        return await publish_to_facebook(access_token, external_account_id, video_url, caption)
    if platform == "instagram":
        return await publish_to_instagram(access_token, external_account_id, video_url, caption)
    raise DistributionPublishException(f"Unsupported platform: {platform}")
