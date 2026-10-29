"""Missing API contracts from ReelCastTestPlan_v1.4.0 (2026-10-28).

Existing metric/checkpoint regressions live in test_tracking*.py; comments there
point to the corresponding UTC cases. These tests exercise the real router/DB.
"""
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.unit.test_tracking import data
from app.dependencies import get_current_user, get_db
from app.models.models import SocialAccount, TrackingLink, TrackingClick, TrackingSyncJob
from app.routes.tracking_routes import router
from app.services import tracking_sync_jobs as jobs


@pytest.fixture
def client(data):
    db, users, _, _ = data
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    with TestClient(app) as client:
        yield client


# F5-UTC01-TC01, TC02, TC06: queue only, reuse run, validate UUID.
def test_manual_sync_contract(data, client, monkeypatch):
    db, _, _, _ = data
    provider = AsyncMock(side_effect=AssertionError('HTTP must not fetch metrics'))
    monkeypatch.setattr(jobs.providers, '_request_adapter', provider)
    monkeypatch.setattr(jobs, 'publish', lambda _: None)
    first = client.post('/api/tracking/sync')
    assert first.status_code == 202
    body = first.json()
    assert body['active'] is True
    assert [row['status'] for row in body['accounts']] == ['queued']
    assert client.post('/api/tracking/sync').json()['job_id'] == body['job_id']
    assert db.query(TrackingSyncJob).count() == 1
    provider.assert_not_awaited()
    assert client.get('/api/tracking/sync/not-a-uuid').status_code == 422


# F5-UTC02-TC01..TC04: exercise Beat entry point and real durable dispatcher.
@pytest.mark.parametrize('scenario', ['members', 'empty', 'active', 'broker'])
def test_scheduled_sync(data, monkeypatch, scenario):
    from app import worker
    db, users, _, _ = data
    engine = db.get_bind()
    monkeypatch.setattr(worker, 'SessionLocal', lambda: Session(engine))
    monkeypatch.setattr(jobs, 'SessionLocal', lambda: Session(engine))
    if scenario == 'empty':
        db.query(SocialAccount).delete(); db.commit()
    if scenario == 'active':
        original = jobs.enqueue_member(db, users[0].user_id)
    published = []
    if scenario == 'broker':
        def unavailable(*args, **kwargs):
            raise ConnectionError('test broker unavailable')
        monkeypatch.setattr(worker.celery_app, 'connection_for_write', unavailable)
    else:
        monkeypatch.setattr(jobs, 'publish', lambda ids: published.extend(ids))
    result = worker.syncTrackingData.run()
    db.expire_all()
    expected = 0 if scenario == 'empty' else 2
    assert result == {'members': expected, 'dispatched': expected}
    assert db.query(TrackingSyncJob).count() == expected
    assert all(job.status == 'queued' for job in db.query(TrackingSyncJob))
    if scenario == 'active':
        assert jobs.latest_status(db, users[0].user_id)['job_id'] == str(original)
    if scenario != 'broker':
        assert len(published) == expected
    assert worker.celery_app.conf.beat_schedule['sync-tracking-data']['schedule'] == 900.0


# F5-UTC04-TC01..TC04: verify response and persistence, including rejected links.
def test_create_link_contract(data, client):
    db, _, _, distributions = data
    path = '/api/tracking/links/' + str(distributions[0].distribution_id)
    response = client.post(path)
    assert response.status_code == 200
    assert response.json()['distribution_id'] == str(distributions[0].distribution_id)
    link = db.query(TrackingLink).one()
    assert response.json()['url'].endswith('/api/tracking/r/' + link.code)
    assert link.destination == 'https://example.com/?aff=001&x=%2F'
    assert client.post(path).json() == response.json()
    assert db.query(TrackingLink).count() == 1
    other = client.post('/api/tracking/links/' + str(distributions[1].distribution_id))
    assert other.status_code == 404 and other.json()['detail'] == 'Distribution not found'
    db.delete(link); db.commit()
    distributions[0].reel.product.affiliate_link = 'javascript:alert(1)'; db.commit()
    invalid = client.post(path)
    assert invalid.status_code == 422
    assert invalid.json()['detail'] == 'Product must have a valid HTTP(S) affiliate destination'
    assert db.query(TrackingLink).count() == 0


# F5-UTC05-TC01..TC06: public redirects and exact click deltas.
def test_public_redirect_contract(data, client):
    db, _, _, distributions = data
    url = client.post('/api/tracking/links/' + str(distributions[0].distribution_id)).json()['url']
    path = '/api/tracking/r/' + url.rsplit('/', 1)[1]
    client.app.dependency_overrides[get_current_user] = lambda: pytest.fail('Redirect requires no login')
    for method, headers, count in [
        ('GET', {'User-Agent': 'Browser'}, 1), ('GET', {'User-Agent': 'Browser'}, 2),
        ('HEAD', {}, 2), ('GET', {'User-Agent': 'Googlebot'}, 2),
        ('GET', {'Sec-Purpose': 'prefetch'}, 2),
    ]:
        response = client.request(method, path, headers=headers, follow_redirects=False)
        assert response.status_code == 302
        assert response.headers['location'] == 'https://example.com/?aff=001&x=%2F'
        assert response.headers['cache-control'] == 'no-store'
        assert db.query(TrackingClick).count() == count
    response = client.get('/api/tracking/r/unknown-code')
    assert response.status_code == 404 and response.json()['detail'] == 'Tracking link not found'
    assert db.query(TrackingClick).count() == 2


# F5-UTC06-TC07..TC10, F5-UTC07-TC06..TC07, F5-UTC09-TC05..TC07.
@pytest.mark.parametrize('path,status,detail', [
    ('dashboard?platform=shopee', 422, 'Unsupported tracking platform'),
    ('dashboard?start=2026-02-01&end=2026-01-01', 422, 'Start date must be before end date'),
    ('analysis?level=shop&metric=views', 422, 'Unsupported analysis level or metric'),
    ('analysis?level=reel&metric=revenue', 422, 'Unsupported analysis level or metric'),
    ('export?start=2027-01-01', 404, 'No tracking data matches these filters'),
])
def test_invalid_reporting_contracts(client, path, status, detail):
    response = client.get('/api/tracking/' + path)
    assert response.status_code == status and response.json()['detail'] == detail


def test_empty_and_unowned_reporting_contracts(data, client):
    _, _, _, distributions = data
    # F5-UTC06-TC10: a connected member with no observations or links.
    response = client.get('/api/tracking/dashboard')
    assert response.status_code == 200 and response.json()['has_data'] is False
    # F5-UTC06-TC09; F5-UTC09-TC06.
    for endpoint in ('dashboard', 'export'):
        response = client.get('/api/tracking/' + endpoint, params={'reel_id': str(distributions[1].reel_id)})
        assert response.status_code == 404 and response.json()['detail'] == 'Tracking scope not found'
    # F5-UTC09-TC07: FastAPI validates the requested file type.
    assert client.get('/api/tracking/export?format=pdf').status_code == 422


# F5-UTC08-TC07: incomplete periods are rejected by both report entry points.
def test_incomplete_comparison_range(client):
    params = dict(a_start='2026-01-01', a_end='2026-01-07', b_end='2026-01-14')
    for endpoint in ('comparison', 'export'):
        response = client.get('/api/tracking/' + endpoint, params=params)
        assert response.status_code == 422
        assert response.json()['detail'] == 'Supply two valid complete date ranges'
