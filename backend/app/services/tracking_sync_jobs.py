"""Durable per-account sync jobs. Database leases fence writes across workers.

The DB is the outbox/checkpoint store; Celery messages contain only job UUIDs.
No DB session is kept open during provider I/O. Manual and Beat use this module.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import random
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from app.core import config
from app.database import SessionLocal
from app.models.models import (TrackingSyncRun as Run, TrackingSyncJob as Job,
    TrackingSyncGate as Gate, User, SocialAccount, Distribution, Reel, TrackingObservation)
from app.services import tracking_provider_service as providers, tracking_service as tracking
from app.services import social_account_service as accounts, oauth_platforms
from app.exceptions import OAuthReauthorizationRequiredException, OAuthProviderException

logger = logging.getLogger('reelcast.performance')
ACTIVE = ('queued', 'running', 'retry')
BATCH = {'youtube': 50, 'tiktok': 20, 'facebook': 4, 'instagram': 4}


def now():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def enqueue_member(db, user_id):
    expire_jobs(db)
    # Lock the owner, then each account in stable order. The partial unique index
    # is a final database-level guard against multiple active jobs per account.
    db.execute(select(User.user_id).where(User.user_id == user_id).with_for_update()).first()
    latest = db.query(Run).filter(Run.user_id == user_id).order_by(Run.created_at.desc()).first()
    if latest and db.query(Job.job_id).filter(Job.user_id == user_id,
            Job.job_id.in_([UUID(value) for value in latest.job_ids]), Job.status.in_(ACTIVE)).first():
        run_id = latest.run_id
        db.commit()
        return run_id
    social = db.query(SocialAccount).filter(SocialAccount.user_id == user_id,
        SocialAccount.platform_name.in_(BATCH)).order_by(SocialAccount.account_id).with_for_update().all()
    stamp = now()
    jobs = []
    for account in social:
        db.execute(insert(Gate).values(platform=account.platform_name).on_conflict_do_nothing(index_elements=['platform']))
        job = db.query(Job).filter(Job.account_id == account.account_id, Job.status.in_(ACTIVE)).first()
        if job is None:
            refs = db.query(Distribution.platform_post_id).join(Reel).filter(
                Distribution.account_id == account.account_id, Reel.user_id == user_id,
                Reel.deleted_at.is_(None), Distribution.status == 'Published', Distribution.platform_post_id.is_not(None)).all()
            job = Job(job_id=uuid4(), user_id=user_id, account_id=account.account_id,
                platform=account.platform_name, status='queued', created_at=stamp, updated_at=stamp,
                next_attempt_at=stamp, post_ids=list(dict.fromkeys(row[0] for row in refs)))
            db.add(job)
        jobs.append(str(job.job_id))
    if latest is not None and set(latest.job_ids) == set(jobs):
        run_id = latest.run_id
    else:
        run = Run(run_id=uuid4(), user_id=user_id, job_ids=jobs, created_at=stamp)
        db.add(run)
        run_id = run.run_id
    db.commit()  # Durable outbox is committed before trying the broker.
    return run_id


def publish(job_ids):
    if not job_ids:
        return
    try:
        from app.core.task_queue import celery_app
        # No broker retry loop in the HTTP request. Beat will redeliver the DB
        # outbox if the broker is down or a worker loses an acknowledgement.
        with celery_app.connection_for_write(connect_timeout=1) as connection:
            for job_id in job_ids[:100]:
                celery_app.send_task('app.worker.syncTrackingAccount', args=[str(job_id)],
                    queue='sync-queue', connection=connection, retry=False,
                    expires=120)
    except Exception:
        logger.warning('tracking_dispatch outcome=deferred')


def expire_jobs(db):
    stamp = now()
    expired = db.query(Job).filter(Job.status.in_(ACTIVE),
        Job.created_at < stamp - timedelta(seconds=config.TRACKING_SYNC_JOB_MAX_SECONDS)).with_for_update(skip_locked=True).all()
    for job in expired:
        job.status = 'partial' if job.metrics else 'failed'
        job.error = 'Sync exceeded its overall deadline; completed batches were retained. Start Sync again to refresh.'
        job.lease_token = None
        job.lease_until = None
        job.updated_at = stamp
        account = db.get(SocialAccount, job.account_id)
        if account:
            account.sync_error = job.error
    db.commit()


def dispatch_due():
    with SessionLocal() as db:
        expire_jobs(db)
        stamp = now()
        ids = [row[0] for row in db.query(Job.job_id).filter(
            or_(Job.status.in_(('queued', 'retry')) & (Job.next_attempt_at <= stamp),
                (Job.status == 'running') & (Job.lease_until <= stamp))).order_by(Job.next_attempt_at).limit(100)]
        # Remove only old terminal history. Active runs remain queryable.
        cutoff = stamp - timedelta(days=7)
        db.query(Run).filter(Run.created_at < cutoff).delete(synchronize_session=False)
        db.query(Job).filter(~Job.status.in_(ACTIVE), Job.updated_at < cutoff).delete(synchronize_session=False)
        db.commit()
    publish(ids)
    return len(ids)


def run_status(db, run_id, user_id):
    run = db.query(Run).filter(Run.run_id == run_id, Run.user_id == user_id).first()
    if run is None:
        return None
    expire_jobs(db)
    rows = db.query(Job).filter(Job.job_id.in_([UUID(value) for value in run.job_ids]), Job.user_id == user_id).order_by(Job.platform, Job.account_id).all()
    active = any(row.status in ACTIVE for row in rows)
    results = [dict(job_id=str(row.job_id), account_id=str(row.account_id), platform=row.platform,
        status=row.status, metrics=row.metrics, completed_posts=row.cursor, total_posts=len(row.post_ids or []),
        success=row.status == 'done', error=row.error, warnings=row.warnings or [],
        next_attempt_at=row.next_attempt_at.isoformat() if row.status == 'retry' else None) for row in rows]
    return dict(job_id=str(run.run_id), status='running' if active else ('partial' if any(row.status != 'done' for row in rows) else 'done'),
                active=active, social_metrics=sum(row.metrics for row in rows), accounts=results)


def latest_status(db, user_id):
    run = db.query(Run).filter(Run.user_id == user_id).order_by(Run.created_at.desc()).first()
    return run_status(db, run.run_id, user_id) if run else None


def claim(db, job_id):
    stamp = now()
    job = db.query(Job).filter(Job.job_id == job_id).with_for_update().first()
    if job is None or job.status not in ACTIVE:
        return None
    # One gate row serializes claims for this platform across every worker.
    gate = db.query(Gate).filter(Gate.platform == job.platform).with_for_update().one()
    db.refresh(job)
    if job.status not in ACTIVE or (job.status == 'running' and aware(job.lease_until) > stamp) or aware(job.next_attempt_at) > stamp:
        db.rollback()
        return None
    if gate.not_before and aware(gate.not_before) > stamp:
        job.next_attempt_at = gate.not_before
        db.commit()
        return None
    running = db.query(Job).filter(Job.platform == job.platform, Job.status == 'running', Job.lease_until > stamp).count()
    if running >= config.TRACKING_SYNC_PLATFORM_JOBS:
        db.rollback()
        return None
    token = uuid4()
    old_status = job.status
    if old_status == 'running':
        # A lost worker counts against the retry budget as well.
        job.retries += 1
        if job.retries >= 3:
            job.status = 'partial' if job.metrics else 'failed'
            job.error = 'Sync worker repeatedly stopped; completed batches were retained.'
            account = db.get(SocialAccount, job.account_id)
            if account:
                account.sync_error = job.error
            job.lease_token = None
            job.lease_until = None
            job.updated_at = stamp
            db.commit()
            return None
    job.status = 'running'
    job.lease_token = token
    job.lease_until = stamp + timedelta(seconds=90)
    job.updated_at = stamp
    db.commit()
    return token


async def fetch_batch(job_id, token):
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if job.lease_token != token:
            return None
        account = db.query(SocialAccount).filter(SocialAccount.account_id == job.account_id,
                                               SocialAccount.user_id == job.user_id).one()
        platform, account_id, external_id = job.platform, str(account.account_id), account.external_account_id or ''
        access = accounts.get_decrypted_access_token(account)
        refresh = accounts.get_decrypted_refresh_token(account)
        needs_refresh = not job.tokens_refreshed
        ids = (job.post_ids or [])[job.cursor:job.cursor + BATCH[platform]]
        page_cursor = job.provider_cursor
        discovery = not job.post_ids
        # A provider fetch timestamp is captured before the request. A delayed
        # old worker cannot masquerade as a newer observation.
        observed_at = now()
    refreshed = None
    if platform == 'youtube' and not refresh:
        raise OAuthReauthorizationRequiredException('youtube has no refresh token; reconnect this platform in Settings')
    if refresh and needs_refresh and platform in {'youtube', 'tiktok'}:
        refreshed = await oauth_platforms.refresh_access_token(platform, refresh)
        access = refreshed['access_token']
        # Persist rotated tokens before the next network request. A later
        # metrics failure must not discard a newly issued refresh token.
        with SessionLocal() as db:
            leased = db.query(Job).filter(Job.job_id == job_id, Job.lease_token == token,
                Job.status == 'running', Job.lease_until > now()).with_for_update().first()
            if leased is None:
                return None
            from app.services.crypto_service import encrypt_token
            account = db.get(SocialAccount, leased.account_id)
            account.access_token = encrypt_token(access)
            account.refresh_token = encrypt_token(refreshed.get('refresh_token') or refresh)
            leased.tokens_refreshed = True
            db.commit()
    metrics = await providers._request_adapter(platform=platform, account_id=account_id,
        external_account_id=external_id, access_token=access, post_ids=ids,
        single_page=discovery, page_cursor=page_cursor)
    return metrics, observed_at, refreshed, refresh


def finish_batch(db, job_id, token, result=None, error=None):
    stamp = now()
    # The row lock and lease predicate fence ALL DB mutations, including tokens,
    # observations, counters, checkpoints and account freshness, in one commit.
    job = db.query(Job).filter(Job.job_id == job_id, Job.status == 'running',
        Job.lease_token == token, Job.lease_until > stamp).with_for_update().first()
    if job is None:
        db.rollback()
        return False
    account = db.query(SocialAccount).filter(SocialAccount.account_id == job.account_id,
                                           SocialAccount.user_id == job.user_id).one()
    if error:
        status = getattr(error, 'status_code', 0)
        retryable = ((status in {429, 502, 503, 504} or isinstance(error, (asyncio.TimeoutError, OAuthProviderException)))
                     and not getattr(error, 'retry_exhausted', False))
        if isinstance(error, providers.TrackingProviderError):
            message = str(error)
        elif isinstance(error, OAuthReauthorizationRequiredException):
            message = error.message
        else:
            message = 'Social sync could not complete; check provider access and adapter availability.'
        job.retries += 1
        if retryable and job.retries < 3:
            delay = getattr(error, 'retry_after', None) or random.uniform(2, min(60, 5 * 2 ** job.retries))
            job.next_attempt_at = stamp + timedelta(seconds=delay)
            job.status = 'retry'
            if status == 429:
                gate = db.get(Gate, job.platform)
                if gate.not_before is None or aware(gate.not_before) < job.next_attempt_at:
                    gate.not_before = job.next_attempt_at
        elif status in {401, 403} or isinstance(error, OAuthReauthorizationRequiredException):
            job.status = 'partial' if job.metrics else 'failed'
        else:
            job.failed_batches += 1
            job.cursor += min(BATCH[job.platform], max(1, len(job.post_ids or []) - job.cursor))
            job.retries = 0
            job.status = 'queued' if job.cursor < len(job.post_ids or []) else ('partial' if job.metrics else 'failed')
            job.next_attempt_at = stamp
        job.error = message
        account.sync_error = message
    else:
        metrics, observed_at, refreshed, refresh = result
        next_cursor = getattr(metrics, 'next_cursor', None)
        if next_cursor is not None and next_cursor == job.provider_cursor:
            raise ValueError('Provider pagination did not advance')
        warnings = set(job.warnings or []) | set(getattr(metrics, 'warnings', []))
        expected = set((job.post_ids or [])[job.cursor:job.cursor + BATCH[job.platform]])
        references = set()
        for metric in metrics:
            ref = metric.get('external_ref') if isinstance(metric, dict) else None
            if not isinstance(ref, str) or not ref.startswith(job.platform + ':') or ref in references:
                raise ValueError('Invalid or duplicate provider reference')
            references.add(ref)
            if expected and ref.removeprefix(job.platform + ':') not in expected:
                raise ValueError('Provider returned an unexpected post')
        if expected - {ref.removeprefix(job.platform + ':') for ref in references}:
            warnings.add('Some posts are unavailable; previous observations were retained')
        for metric in metrics:
            ref = metric['external_ref']
            # Preserve the whole previous observation if this attempt loses a
            # previously known component. Its original timestamp stays honest;
            # never mix old counters into a freshly timestamped observation.
            previous = db.query(TrackingObservation).filter(TrackingObservation.user_id == job.user_id,
                TrackingObservation.account_id == job.account_id, TrackingObservation.external_ref == ref
                ).order_by(TrackingObservation.observed_at.desc()).first()
            if previous and any(getattr(previous, key) is not None and metric.get(key) is None for key in tracking.SOCIAL_METRICS):
                warnings.add('Incomplete posts kept their previous values and observation time')
                continue
            tracking.record_metric(db, user_id=job.user_id, social_account_id=job.account_id,
                source_platform=job.platform, external_ref=ref,
                record_date=datetime.fromisoformat(metric['record_date']).date() if metric.get('record_date') else None,
                observed_at=observed_at, **{key: metric.get(key) for key in tracking.SOCIAL_METRICS})
            job.metrics += 1
        if refreshed:
            from app.services.crypto_service import encrypt_token
            # Token rotation is fenced and committed with the checkpoint.
            account.access_token = encrypt_token(refreshed['access_token'])
            account.refresh_token = encrypt_token(refreshed.get('refresh_token') or refresh)
        job.cursor += min(BATCH[job.platform], max(1, len(job.post_ids or []) - job.cursor)) if job.post_ids else len(metrics)
        job.provider_cursor = next_cursor
        job.warnings = sorted(warnings)
        job.retries = 0
        complete = job.cursor >= len(job.post_ids) if job.post_ids else next_cursor is None
        job.status = ('partial' if warnings or job.failed_batches else 'done') if complete else 'queued'
        job.next_attempt_at = stamp
        if job.status == 'done':
            job.error = None
            account.sync_error = None
            account.last_synced_at = stamp
        elif job.status == 'partial':
            account.sync_error = job.error or '; '.join(sorted(warnings))
    job.lease_token = None
    job.lease_until = None
    job.updated_at = stamp
    db.commit()
    logger.info('tracking_batch platform=%s status=%s metrics=%s cursor=%s', job.platform, job.status, job.metrics, job.cursor)
    return job.status == 'queued'


def process_job(job_id):
    job_id = UUID(str(job_id))
    with SessionLocal() as db:
        expire_jobs(db)
        token = claim(db, job_id)
    if token is None:
        return
    error = result = None
    try:
        async def fetch():
            return await asyncio.wait_for(fetch_batch(job_id, token), timeout=60)
        result = asyncio.run(fetch())
    except Exception as exc:
        error = exc
    try:
        with SessionLocal() as db:
            more = finish_batch(db, job_id, token, result, error)
    except Exception:
        # A malformed batch is rolled back as a unit, then safely marked failed.
        with SessionLocal() as db:
            more = finish_batch(db, job_id, token, error=ValueError('Invalid batch'))
    if more:
        publish([job_id])
