from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from app.schemas import SyncRequest
from app.services.youtube import YouTubeProvider
from app.services.tiktok import TikTokProvider
from app.services.instagram import InstagramProvider
from app.services.facebook import FacebookProvider


def request(platform, ids):
    return SyncRequest(platform=platform, account_id='account', external_account_id='channel',
                       access_token='token', from_date=date(2026,10,1), to_date=date(2026,10,15), post_ids=ids)


def configure(provider):
    provider.require = lambda *args: None
    provider.settings = lambda: SimpleNamespace(youtube_api_base_url='https://youtube.test',
                                                tiktok_api_base_url='https://tiktok.test',
                                                meta_graph_api_base_url='https://meta.test')


@pytest.mark.asyncio
async def test_youtube_known_older_posts_batch_and_unavailable_counters():
    provider = YouTubeProvider(); configure(provider)
    provider.request = AsyncMock(side_effect=[
        {'items':[{'id':'old', 'snippet':{'publishedAt':'2025-01-01T00:00:00Z'},
                   'statistics':{'viewCount':'10', 'likeCount':'0'}}]}, {'items':[]}])
    metrics = await provider.sync(request('youtube', [str(i) for i in range(51)]))
    assert provider.request.await_count == 2
    assert all('/videos' in call.args[1] for call in provider.request.call_args_list)
    assert metrics[0].record_date == date(2025,1,1) and metrics[0].views == 10
    assert metrics[0].likes == 0 and metrics[0].comments is None and metrics[0].shares is None
    assert metrics[0].engagement is None


@pytest.mark.asyncio
async def test_tiktok_known_posts_batch_at_twenty_and_keep_old_post():
    provider = TikTokProvider(); configure(provider)
    provider.request = AsyncMock(side_effect=[{'data':{'videos':[{'id':'old', 'create_time':1735689600,
                                             'view_count':10, 'like_count':1, 'comment_count':2, 'share_count':3}]}},
                                             {'data':{'videos':[]}}])
    metrics = await provider.sync(request('tiktok', [str(i) for i in range(21)]))
    assert [len(call.kwargs['json']['filters']['video_ids']) for call in provider.request.call_args_list] == [20,1]
    assert metrics[0].engagement == 6 and metrics[0].shares == 3
    assert metrics[0].record_date < date(2026,10,1)


@pytest.mark.asyncio
async def test_instagram_does_not_substitute_reach_for_views():
    provider = InstagramProvider(); configure(provider)
    provider.request = AsyncMock(return_value={'id':'old','timestamp':'2025-01-01T00:00:00Z',
                                               'media_type':'VIDEO', 'like_count':0, 'comments_count':0})
    provider._media_insights = AsyncMock(return_value={'reach':100, 'shares':0})
    metrics = await provider.sync(request('instagram', ['old']))
    assert metrics[0].views is None and metrics[0].engagement == 0
    assert metrics[0].likes == 0 and metrics[0].shares == 0


@pytest.mark.asyncio
async def test_facebook_reactions_are_not_likes_and_native_clicks_are_not_affiliate_visits():
    provider = FacebookProvider(); configure(provider)
    provider.request = AsyncMock(return_value={'id':'old','created_time':'2025-01-01T00:00:00Z',
        'reactions':{'summary':{'total_count':3}}, 'comments':{'summary':{'total_count':2}}, 'shares':{'count':1},
        'insights':{'data':[{'name':'post_clicks','values':[{'value':999}]}]}})
    metrics = await provider.sync(request('facebook', ['old']))
    assert metrics[0].views is None and metrics[0].likes is None
    assert metrics[0].engagement == 6 and metrics[0].clicks == 0
