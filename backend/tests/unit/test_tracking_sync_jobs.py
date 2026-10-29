from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.unit.test_tracking import data
from app.dependencies import get_current_user, get_db
from app.models.models import TrackingSyncJob as Job, TrackingSyncGate as Gate, TrackingObservation, SocialAccount
from app.routes.tracking_routes import router
from app.services import tracking_sync_jobs as jobs
from app.services.tracking_provider_service import TrackingProviderError, AdapterMetrics


def prepare(data):
    db, users, accounts, _ = data
    run_id = jobs.enqueue_member(db, users[0].user_id)
    job = db.query(Job).filter(Job.user_id == users[0].user_id).one()
    return db, users, accounts, run_id, job


def result(ref='youtube:same', **kwargs):
    return AdapterMetrics([dict(external_ref=ref, views=12, **kwargs)]), jobs.now(), None, None


# F5-UTC01-TC02; F5-UTC03-TC02
def test_duplicate_clicks_share_run_and_account_job(data):
    db, users, _, run, job = prepare(data)
    assert jobs.enqueue_member(db, users[0].user_id) == run
    assert db.query(Job).count() == 1
    token = jobs.claim(db, job.job_id)
    assert token is not None
    assert jobs.claim(db, job.job_id) is None
    assert jobs.enqueue_member(db, users[0].user_id) == run


# F5-UTC02-TC03
def test_database_rejects_duplicate_active_account(data):
    db, users, accounts, _, job = prepare(data)
    db.add(Job(user_id=users[0].user_id, account_id=accounts[0].account_id, platform='youtube',
               status='queued', created_at=jobs.now(), updated_at=jobs.now(), next_attempt_at=jobs.now()))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# F5-UTC01-TC03
def test_repeated_click_does_not_restart_accounts_that_already_finished_in_active_run(data):
    db, users, accounts, _ = data
    account = SocialAccount(account_id=uuid4(), user_id=users[0].user_id, platform_name='facebook', access_token='test')
    db.add(account); db.commit()
    run = jobs.enqueue_member(db, users[0].user_id)
    first = db.query(Job).filter(Job.platform == 'facebook').one()
    token = jobs.claim(db, first.job_id)
    jobs.finish_batch(db, first.job_id, token, (AdapterMetrics([]), jobs.now(), None, None))
    assert first.status == 'done'
    assert jobs.enqueue_member(db, users[0].user_id) == run
    assert db.query(Job).count() == 2


# F5-UTC01-TC04, F5-UTC01-TC05
def test_endpoint_accepts_without_provider_calls_and_hides_other_members(data, monkeypatch):
    db, users, _, _, _ = prepare(data)
    monkeypatch.setattr(jobs, 'publish', lambda *args: None)
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    response = client.post('/api/tracking/sync')
    assert response.status_code == 202 and response.json()['active']
    run_id = response.json()['job_id']
    assert client.get('/api/tracking/sync/latest').json()['job_id'] == run_id
    app.dependency_overrides[get_current_user] = lambda: users[1]
    assert client.get('/api/tracking/sync/'+run_id).status_code == 404
    assert client.get('/api/tracking/sync/latest').json() is None


# F5-UTC03-TC01
def test_checkpoint_commits_once_and_new_runs_can_refresh(data):
    db, users, accounts, run_id, job = prepare(data)
    token = jobs.claim(db, job.job_id)
    assert jobs.finish_batch(db, job.job_id, token, result()) is False
    assert not jobs.finish_batch(db, job.job_id, token, result())
    assert db.query(TrackingObservation).count() == 1
    assert accounts[0].last_synced_at is not None
    assert jobs.run_status(db, run_id, users[0].user_id)['status'] == 'done'
    assert jobs.enqueue_member(db, users[0].user_id) != run_id


# F5-UTC03-TC03
def test_stale_worker_cannot_commit_after_reclaim(data):
    db, users, accounts, _, job = prepare(data)
    old = jobs.claim(db, job.job_id)
    job.lease_until = jobs.now() - timedelta(seconds=1); db.commit()
    new = jobs.claim(db, job.job_id)
    assert old != new
    assert not jobs.finish_batch(db, job.job_id, old, result())
    assert db.query(TrackingObservation).count() == 0
    jobs.finish_batch(db, job.job_id, new, result())
    assert db.query(TrackingObservation).count() == 1


def test_platform_gate_limits_across_users_and_preserves_other_platforms(data, monkeypatch):
    db, users, accounts, _, job = prepare(data)
    monkeypatch.setattr(jobs.config, 'TRACKING_SYNC_PLATFORM_JOBS', 1)
    jobs.enqueue_member(db, users[1].user_id)
    other = db.query(Job).filter(Job.user_id == users[1].user_id).one()
    assert jobs.claim(db, job.job_id)
    assert jobs.claim(db, other.job_id) is None
    gate = db.get(Gate, 'youtube'); gate.not_before = jobs.now() + timedelta(seconds=60); db.commit()
    job.lease_until = jobs.now() - timedelta(seconds=1); db.commit()
    assert jobs.claim(db, other.job_id) is None


# F5-UTC03-TC04
def test_rate_limit_defers_and_does_not_erase_previous_batches(data):
    db, users, _, run_id, job = prepare(data)
    token = jobs.claim(db, job.job_id)
    jobs.finish_batch(db, job.job_id, token, error=TrackingProviderError('rate limited', 429, 120))
    db.refresh(job)
    assert job.status == 'retry' and job.cursor == 0 and job.retries == 1
    assert jobs.aware(job.next_attempt_at) > jobs.now() + timedelta(seconds=110)
    assert jobs.claim(db, job.job_id) is None
    assert db.get(Gate, 'youtube').not_before is not None
    assert jobs.run_status(db, run_id, users[0].user_id)['active']


# F5-UTC03-TC05
def test_invalid_batch_is_atomic_and_missing_metrics_keep_honest_timestamp(data):
    db, users, accounts, _, job = prepare(data)
    token = jobs.claim(db, job.job_id)
    old_time = datetime(2026, 10, 1, tzinfo=timezone.utc)
    metrics = AdapterMetrics([{'external_ref': 'youtube:same', 'views': 8, 'shares': 2}])
    jobs.finish_batch(db, job.job_id, token, (metrics, old_time, None, None))
    new_run = jobs.enqueue_member(db, users[0].user_id)
    new_job = db.query(Job).filter(Job.status == 'queued').one()
    token = jobs.claim(db, new_job.job_id)
    jobs.finish_batch(db, new_job.job_id, token, result())
    previous = db.query(TrackingObservation).one()
    assert previous.views == 8 and previous.shares == 2
    assert jobs.aware(previous.observed_at) == old_time
    assert jobs.run_status(db, new_run, users[0].user_id)['status'] == 'partial'
    assert jobs.aware(accounts[0].last_synced_at) < jobs.now()


# F5-UTC03-TC06
def test_completed_batch_survives_later_failure_and_retry_resumes(data):
    db, users, _, _, job = prepare(data)
    job.platform = 'facebook'; job.post_ids = ['same', '2', '3', '4', '5']; db.commit()
    db.execute(jobs.insert(Gate).values(platform='facebook').on_conflict_do_nothing(index_elements=['platform'])); db.commit()
    token = jobs.claim(db, job.job_id)
    # Account platform must agree with every observation's source.
    account = db.get(SocialAccount, job.account_id); account.platform_name = 'facebook'; db.commit()
    assert jobs.finish_batch(db, job.job_id, token, result('facebook:same'))
    assert job.cursor == 4 and db.query(TrackingObservation).count() == 1
    token = jobs.claim(db, job.job_id)
    jobs.finish_batch(db, job.job_id, token, error=TrackingProviderError('timeout', 504))
    assert job.cursor == 4 and job.status == 'retry'
    job.next_attempt_at = jobs.now(); db.commit()
    token = jobs.claim(db, job.job_id)
    jobs.finish_batch(db, job.job_id, token, result('facebook:5'))
    assert job.cursor == 5 and db.query(TrackingObservation).count() == 2
    assert job.status == 'partial'  # first batch explicitly lacked 3 requested posts


# F5-UTC03-TC10
def test_deadline_settles_pending_jobs_and_retains_completed_count(data):
    db, users, _, run, job = prepare(data)
    job.created_at = jobs.now() - timedelta(hours=2); job.metrics = 4; db.commit()
    status = jobs.run_status(db, run, users[0].user_id)
    assert not status['active'] and status['status'] == 'partial'
    assert status['social_metrics'] == 4
    assert jobs.enqueue_member(db, users[0].user_id) != run


# F5-UTC01-TC07
def test_broker_failure_leaves_durable_outbox(data, monkeypatch):
    db, users, _, run, job = prepare(data)
    from app.worker import celery_app
    def fail(*args, **kwargs):
        raise ConnectionError('do not log broker URL or password')
    monkeypatch.setattr(celery_app, 'connection_for_write', fail)
    jobs.publish([job.job_id])
    db.expire_all()
    assert jobs.run_status(db, run, users[0].user_id)['active']
    assert db.get(Job, job.job_id).status == 'queued'


def test_worker_processes_claimed_batch_through_fenced_commit(data, monkeypatch):
    db, users, accounts, _, job = prepare(data)
    accounts[0].platform_name = job.platform = 'facebook'; db.commit()
    db.execute(jobs.insert(Gate).values(platform='facebook').on_conflict_do_nothing(index_elements=['platform'])); db.commit()
    engine = db.get_bind()
    monkeypatch.setattr(jobs, 'SessionLocal', lambda: Session(engine))
    monkeypatch.setattr(jobs.accounts, 'get_decrypted_access_token', lambda _: 'test-token')
    monkeypatch.setattr(jobs.accounts, 'get_decrypted_refresh_token', lambda _: None)
    monkeypatch.setattr(jobs.providers, '_request_adapter', AsyncMock(return_value=AdapterMetrics([{'external_ref': 'facebook:same', 'views': 10}])))
    jobs.process_job(job.job_id)
    db.expire_all()
    assert db.get(Job, job.job_id).status == 'done'
    assert db.query(TrackingObservation).one().views == 10


def test_discovery_cursor_is_checkpointed_instead_of_rereading_the_first_page(data):
    db, users, _, run, job = prepare(data)
    job.post_ids = []; db.commit()
    token = jobs.claim(db, job.job_id)
    page = AdapterMetrics([{'external_ref': 'youtube:first', 'views': 2}], next_cursor='page-2')
    assert jobs.finish_batch(db, job.job_id, token, (page, jobs.now(), None, None))
    assert job.provider_cursor == 'page-2' and job.cursor == 1
    token = jobs.claim(db, job.job_id)
    jobs.finish_batch(db, job.job_id, token, (AdapterMetrics([{'external_ref': 'youtube:second', 'views': 3}]), jobs.now(), None, None))
    assert job.status == 'done' and job.cursor == 2
    assert db.query(TrackingObservation).count() == 2


# F5-UTC03-TC07
def test_exhausted_provider_retry_is_not_multiplied_by_worker(data):
    db, _, _, _, job = prepare(data)
    token = jobs.claim(db, job.job_id)
    error = TrackingProviderError('provider retries exhausted', 504, retry_exhausted=True)
    jobs.finish_batch(db, job.job_id, token, error=error)
    assert job.status == 'failed' and job.failed_batches == 1


# F5-UTC03-TC08
def test_malformed_later_metric_rolls_back_the_entire_batch(data):
    db, _, _, _, job = prepare(data)
    job.post_ids = ['same', 'other']; db.commit()
    token = jobs.claim(db, job.job_id)
    metrics = AdapterMetrics([{'external_ref': 'youtube:same', 'views': 10}, {'external_ref': 'youtube:other', 'views': -1}])
    with pytest.raises(ValueError):
        jobs.finish_batch(db, job.job_id, token, (metrics, jobs.now(), None, None))
    db.rollback()
    assert db.query(TrackingObservation).count() == 0
    assert db.get(Job, job.job_id).cursor == 0


@pytest.mark.asyncio
# F5-UTC03-TC09
async def test_rotated_tokens_survive_a_later_metrics_failure(data, monkeypatch):
    db, users, accounts, _, job = prepare(data)
    engine = db.get_bind()
    monkeypatch.setattr(jobs, 'SessionLocal', lambda: Session(engine))
    monkeypatch.setattr(jobs.accounts, 'get_decrypted_access_token', lambda _: 'old-access')
    monkeypatch.setattr(jobs.accounts, 'get_decrypted_refresh_token', lambda _: 'old-refresh')
    monkeypatch.setattr(jobs.oauth_platforms, 'refresh_access_token', AsyncMock(return_value={'access_token': 'new-access', 'refresh_token': 'new-refresh'}))
    monkeypatch.setattr(jobs.providers, '_request_adapter', AsyncMock(side_effect=TrackingProviderError('timeout', 504)))
    monkeypatch.setattr('app.services.crypto_service.encrypt_token', lambda value: 'encrypted:'+value)
    token = jobs.claim(db, job.job_id)
    with pytest.raises(TrackingProviderError):
        await jobs.fetch_batch(job.job_id, token)
    db.expire_all()
    assert db.get(Job, job.job_id).tokens_refreshed
    assert accounts[0].refresh_token == 'encrypted:new-refresh'
