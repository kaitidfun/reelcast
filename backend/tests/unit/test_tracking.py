import csv
import io
from datetime import date, datetime, timezone
from unittest.mock import patch
from uuid import uuid4
from zipfile import ZipFile
from xml.etree import ElementTree

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.database import Base
from app.dependencies import get_current_user, get_db
from app.models.models import User, Campaign, Product, Reel, SocialAccount, Distribution, TrackingObservation, TrackingClick
from app.routes.tracking_routes import router
from app.services import tracking_service as service, tracking_provider_service as provider

@compiles(JSONB, 'sqlite')
def compile_json(type_, compiler, **kw):
    return 'JSON'

@pytest.fixture
def data():
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        users, accounts, distributions = [], [], []
        for _ in range(2):
            user = User(user_id=uuid4(), display_name='Member')
            campaign = Campaign(campaign_id=uuid4(), user_id=user.user_id, name='แคมเปญ')
            product = Product(product_id=uuid4(), campaign_id=campaign.campaign_id, user_id=user.user_id,
                              product_name='001สินค้า', affiliate_link='https://example.com/?aff=001&x=%2F')
            account = SocialAccount(account_id=uuid4(), user_id=user.user_id, platform_name='youtube', access_token='encrypted')
            reel = Reel(reel_id=uuid4(), user_id=user.user_id, product_id=product.product_id, prompt_text='=BAD()')
            distribution = Distribution(distribution_id=uuid4(), reel_id=reel.reel_id, account_id=account.account_id,
                                        platform_post_id='same', status='Published')
            db.add_all([user, campaign, product, account, reel, distribution])
            users.append(user); accounts.append(account); distributions.append(distribution)
        db.commit()
        yield db, users, accounts, distributions
    engine.dispose()

def observe(db, user, account, views, day):
    service.record_metric(db, user_id=user.user_id, social_account_id=account.account_id,
                          source_platform='youtube', external_ref='youtube:same', views=views, likes=0,
                          observed_at=datetime(2026, 1, day, 10, tzinfo=timezone.utc))
    db.commit()

def test_snapshots_are_idempotent_and_members_isolated(data):
    db, users, accounts, _ = data
    observe(db, users[0], accounts[0], 10, 1)
    observe(db, users[0], accounts[0], 12, 1)
    observe(db, users[0], accounts[0], 20, 2)
    observe(db, users[1], accounts[1], 99, 1)
    assert db.query(TrackingObservation).count() == 3
    totals = service.dashboard(db, user_id=users[0].user_id)['totals']
    assert totals['views'] == 20 and totals['likes'] == 0 and totals['comments'] is None
    assert service.dashboard(db, user_id=users[1].user_id)['totals']['views'] == 99
    assert service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,1), end=date(2026,1,1))['totals']['views'] == 12
    with pytest.raises(LookupError):
        observe(db, users[1], accounts[0], 1000, 1)

def test_redirect_click_rules_period_boundaries_and_missing_coverage(data):
    db, users, _, distributions = data
    link = service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)
    assert service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id).code == link.code
    with pytest.raises(LookupError):
        service.ensure_tracking_link(db, user_id=users[1].user_id, distribution_id=distributions[0].distribution_id)
    for method, agent, purpose in [('HEAD','Browser',''),('GET','Googlebot',''),('GET','Browser','prefetch')]:
        service.follow_link(db, code=link.code, method=method, user_agent=agent, purpose=purpose)
    assert db.query(TrackingClick).count() == 0
    for _ in range(2):
        assert service.follow_link(db, code=link.code) == 'https://example.com/?aff=001&x=%2F'
    assert db.query(TrackingClick).count() == 2
    db.query(TrackingClick).delete()
    link.created_at = datetime(2025,12,31,tzinfo=timezone.utc)
    db.add_all([TrackingClick(link_id=link.link_id, clicked_at=datetime(2026,1,1,17,tzinfo=timezone.utc)) for _ in range(3)])
    db.add_all([TrackingClick(link_id=link.link_id, clicked_at=datetime(2026,1,2,17,tzinfo=timezone.utc)) for _ in range(6)])
    db.commit()
    periods = dict(a_start=date(2026,1,2), a_end=date(2026,1,2), b_start=date(2026,1,3), b_end=date(2026,1,3))
    result = service.compare_periods(db, user_id=users[0].user_id, **periods)
    assert (result['a']['clicks'], result['b']['clicks'], result['difference'], result['percentage_change']) == (3,6,3,100)
    periods.update(a_start=date(2026,1,1), a_end=date(2026,1,1))
    result = service.compare_periods(db, user_id=users[0].user_id, **periods)
    assert result['difference'] == 6 and result['percentage_change'] is None
    link.created_at = datetime(2026,1,2,tzinfo=timezone.utc); db.commit()
    assert service.compare_periods(db, user_id=users[0].user_id, **periods)['difference'] is None

def test_api_export_ownership_thai_formula_safety_and_redirect(data):
    db, users, accounts, distributions = data
    observe(db, users[0], accounts[0], 10, 1)
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    assert client.get('/api/tracking/export?start=2027-01-01').status_code == 404
    assert client.get('/api/tracking/export?reel_id='+str(distributions[1].reel_id)).status_code == 404
    assert client.get('/api/tracking/dashboard?platform=shopee').status_code == 422
    assert client.get('/api/tracking/dashboard?start=2026-02-01&end=2026-01-01').status_code == 422
    response = client.get('/api/tracking/export?format=csv')
    assert response.status_code == 200 and response.content.startswith(b'\xef\xbb\xbf')
    rows = list(csv.DictReader(io.StringIO(response.content.decode('utf-8-sig'))))
    assert len(rows) == 1 and rows[0]['product_name'] == '001สินค้า'
    assert rows[0]['reel_name'].startswith("'=") and rows[0]['comments'] == 'Unavailable'
    xlsx = client.get('/api/tracking/export?format=xlsx')
    with ZipFile(io.BytesIO(xlsx.content)) as archive:
        for name in archive.namelist():
            ElementTree.fromstring(archive.read(name))
        assert b'<f>' not in archive.read('xl/worksheets/sheet2.xml')
        assert '001สินค้า' in archive.read('xl/worksheets/sheet2.xml').decode()
    link = service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)
    response = client.get('/api/tracking/r/'+link.code, follow_redirects=False)
    assert response.status_code == 302 and response.headers['cache-control'] == 'no-store'
    assert response.headers['location'] == link.destination
    assert client.post('/api/tracking/metrics',json={}).status_code == 404

@pytest.mark.asyncio
async def test_partial_account_failure_rolls_back_and_continues(data):
    db, users, accounts, _ = data
    other = SocialAccount(account_id=uuid4(), user_id=users[0].user_id, platform_name='tiktok', access_token='encrypted')
    db.add(other); db.commit()
    async def sync(db, **kwargs):
        if kwargs['platform'] == 'youtube':
            service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                                  source_platform='youtube', external_ref='youtube:same', views=4)
            raise ValueError('invalid later page')
        return 2
    with patch.object(provider, '_sync_metrics', side_effect=sync), patch.object(provider.social_account_service, 'get_decrypted_access_token', return_value='token'):
        result = await provider.sync_member(db, user_id=users[0].user_id)
    assert result['social_metrics'] == 2 and sum(row['success'] for row in result['accounts']) == 1
    assert db.query(TrackingObservation).count() == 0 and accounts[0].last_synced_at is None

def test_all_filtered_details_export_and_invalid_destinations(data):
    db, users, accounts, distributions = data
    original = distributions[0].reel
    for index in range(7):
        reel = Reel(reel_id=uuid4(), user_id=users[0].user_id, product_id=original.product_id, prompt_text=f'Reel {index}')
        distribution = Distribution(distribution_id=uuid4(), reel_id=reel.reel_id,
                                    account_id=accounts[0].account_id, platform_post_id=str(index), status='Published')
        db.add_all([reel, distribution]); db.commit()
        service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                              source_platform='youtube', external_ref=f'youtube:{index}', views=index)
        db.commit()
    report = service.dashboard(db, user_id=users[0].user_id, product_id=original.product_id)
    assert len(report['details']) == 7 and len(report['reels']) == 5
    assert report['totals']['views'] == 21
    from app.services.tracking_export_service import report_bytes
    content = report_bytes(report['details'], format='csv', filters={})
    assert len(list(csv.DictReader(io.StringIO(content.decode('utf-8-sig'))))) == 7
    assert service.detail_rows(db, user_id=users[1].user_id, product_id=original.product_id) == []
    original.product.affiliate_link = 'javascript:alert(1)'; db.commit()
    with pytest.raises(ValueError):
        service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)

def test_observations_across_bangkok_midnight_do_not_overwrite_previous_day(data):
    db, users, accounts, _ = data
    for hour, views in ((16,10),(18,20)):
        service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                              source_platform='youtube', external_ref='youtube:same', views=views,
                              observed_at=datetime(2026,1,1,hour,tzinfo=timezone.utc))
        db.commit()
    assert db.query(TrackingObservation).count() == 2
    assert service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,1), end=date(2026,1,1))['totals']['views'] == 10
    assert service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,2), end=date(2026,1,2))['totals']['views'] == 20
