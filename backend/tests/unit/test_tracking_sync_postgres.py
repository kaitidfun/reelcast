"""Opt-in PostgreSQL concurrency checks in a disposable, uniquely named schema."""
import os
import re
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from app.database import engine, Base
from app.models.models import User, SocialAccount, TrackingSyncJob as Job
from app.services import tracking_sync_jobs as jobs

pytestmark = pytest.mark.skipif(os.getenv('TRACKING_SYNC_POSTGRES_TEST') != '1', reason='Opt-in disposable PostgreSQL schema')


def test_real_postgres_serializes_duplicate_and_platform_claims(monkeypatch):
    schema = 'reelcast_sync_test_' + uuid4().hex[:12]
    assert re.fullmatch(r'reelcast_sync_test_[a-f0-9]{12}', schema)
    isolated = engine.execution_options(schema_translate_map={None: schema})
    with engine.begin() as connection:
        connection.execute(CreateSchema(schema))
    try:
        Base.metadata.create_all(isolated)
        ids = []
        with Session(isolated) as db:
            for index in range(2):
                user = User(user_id=uuid4(), display_name='Disposable sync test')
                account = SocialAccount(account_id=uuid4(), user_id=user.user_id, platform_name='facebook', access_token='test')
                db.add_all([user, account]); db.commit()
                jobs.enqueue_member(db, user.user_id)
                ids.append(db.query(Job.job_id).filter(Job.user_id == user.user_id).one()[0])
        monkeypatch.setattr(jobs.config, 'TRACKING_SYNC_PLATFORM_JOBS', 1)

        def compete(job_ids):
            barrier = Barrier(2)
            def claim(job_id):
                with Session(isolated) as db:
                    barrier.wait(timeout=5)
                    return jobs.claim(db, job_id)
            with ThreadPoolExecutor(max_workers=2) as pool:
                return list(pool.map(claim, job_ids))

        results = compete([ids[0], ids[0]])
        assert sum(token is not None for token in results) == 1
        with Session(isolated) as db:
            db.query(Job).update({'status': 'queued', 'lease_until': None, 'lease_token': None}); db.commit()
        results = compete(ids)
        assert sum(token is not None for token in results) == 1
    finally:
        with engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))
