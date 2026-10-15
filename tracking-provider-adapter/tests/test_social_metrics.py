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
                                                facebook_graph_api_base_url='https://facebook.test',
                                                instagram_graph_api_base_url='https://instagram.test')


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
    assert provider.request.call_args.args[1] == 'https://instagram.test/old'
    assert metrics[0].views is None and metrics[0].engagement == 0
    assert metrics[0].likes == 0 and metrics[0].shares == 0


@pytest.mark.asyncio
async def test_facebook_reactions_are_not_likes_and_native_clicks_are_not_affiliate_visits():
    provider = FacebookProvider(); configure(provider)
    provider.request = AsyncMock(return_value={'id':'page_post','created_time':'2025-01-01T00:00:00Z',
        'reactions':{'summary':{'total_count':3}}, 'comments':{'summary':{'total_count':2}}, 'shares':{'count':1},
        'insights':{'data':[{'name':'post_clicks','values':[{'value':999}]}]}})
    metrics = await provider.sync(request('facebook', ['page_post']))
    assert provider.request.call_args.args[1] == 'https://facebook.test/page_post'
    assert metrics[0].views is None and metrics[0].likes is None
    assert metrics[0].engagement == 6 and metrics[0].clicks == 0


@pytest.mark.asyncio
async def test_facebook_distribution_video_uses_video_fields_not_post_reactions():
    provider = FacebookProvider(); configure(provider)
    provider.request = AsyncMock(return_value={'id':'123', 'created_time':'2026-01-01T00:00:00Z',
        'views':10, 'likes':{'summary':{'total_count':2}}, 'comments':{'summary':{'total_count':1}}})
    metrics = await provider.sync(request('facebook', ['123']))
    fields = provider.request.call_args.kwargs['params']['fields']
    assert 'views' in fields and 'likes' in fields and 'reactions' not in fields and 'shares' not in fields
    assert metrics[0].external_ref == 'facebook:123'
    assert metrics[0].views == 10 and metrics[0].likes == 2 and metrics[0].comments == 1
    assert metrics[0].shares is None and metrics[0].engagement == 3

@pytest.mark.asyncio
async def test_tiktok_resolves_publish_job_and_preserves_distribution_reference():
    provider = TikTokProvider(); configure(provider)
    provider.request = AsyncMock(side_effect=[
        {'data':{'status':'PUBLISH_COMPLETE','publicaly_available_post_id':['123']}},
        {'data':{'videos':[{'id':'123','create_time':1735689600,'view_count':10,'like_count':1,'comment_count':2,'share_count':3}]}}])
    metrics = await provider.sync(request('tiktok',['v_pub_file~job']))
    assert provider.request.call_args_list[0].kwargs['json'] == {'publish_id':'v_pub_file~job'}
    assert provider.request.call_args_list[1].kwargs['json'] == {'filters':{'video_ids':['123']}}
    assert metrics[0].external_ref == 'tiktok:v_pub_file~job' and metrics[0].views == 10


@pytest.mark.asyncio
async def test_tiktok_without_public_video_keeps_counters_unavailable():
    provider = TikTokProvider(); configure(provider)
    provider.request = AsyncMock(return_value={'data':{'status':'PUBLISH_COMPLETE','publicaly_available_post_id':[]}})
    metrics = await provider.sync(request('tiktok',['v_pub_file~private']))
    assert provider.request.await_count == 1
    assert metrics[0].external_ref == 'tiktok:v_pub_file~private'
    assert metrics[0].views is None and metrics[0].engagement is None and metrics[0].record_date is None
