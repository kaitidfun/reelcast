import asyncio
from io import BytesIO
import logging
from threading import Event
from unittest.mock import MagicMock

from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.core.performance import PerformanceMiddleware, install_sql_timing
from app.services import storage_service
from app.worker import celery_app


def test_request_sql_timing_survives_threadpool_and_does_not_leak_between_requests(caplog):
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    install_sql_timing(engine)
    install_sql_timing(engine)  # attaching twice must not double-count
    app = FastAPI()
    app.add_middleware(PerformanceMiddleware)

    @app.get('/read/{identifier}')
    def read(identifier: str):
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        return {'ok': True}

    @app.get('/empty')
    def empty():
        return {'ok': True}

    try:
        with caplog.at_level(logging.INFO, logger='reelcast.performance'), TestClient(app) as client:
            first = client.get('/read/private-id?token=secret-value')
            second = client.get('/empty')
        assert first.status_code == second.status_code == 200
        assert 'db;dur=' in first.headers['server-timing']
        assert first.headers['x-request-id'] != second.headers['x-request-id']
        assert 'sql_count=1' in caplog.text and 'sql_count=0' in caplog.text
        assert '/read/{identifier}' in caplog.text
        assert 'private-id' not in caplog.text and 'secret-value' not in caplog.text
    finally:
        engine.dispose()


async def test_storage_upload_does_not_hold_event_loop(monkeypatch):
    started, release = Event(), Event()
    storage = MagicMock()
    def slow_upload(**_kwargs):
        started.set()
        assert release.wait(3), 'event loop could not release the upload'
    storage.put_object.side_effect = slow_upload
    monkeypatch.setattr(storage_service, '_get_s3_client', lambda: storage)
    monkeypatch.setattr(storage_service, 'R2_BUCKET_NAME', 'test')
    monkeypatch.setattr(storage_service, 'R2_ENDPOINT_URL', 'https://storage.test')
    upload = UploadFile(filename='image.png', file=BytesIO(b'image'))
    task = asyncio.create_task(storage_service.upload_file(upload))
    try:
        assert await asyncio.to_thread(started.wait, 2)
        assert not task.done()
        release.set()
        result = await task
        assert result['size'] == 5
        assert upload.file.tell() == 0
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
        await upload.close()


def test_jobs_route_to_dedicated_workers_without_connecting_to_broker():
    router = celery_app.amqp.Router()
    for name, args, kwargs, queue in (
        ('generateReels', ('reel', 'ig', 'bottom-right'), {}, 'generation-queue'),
        ('generateReels', ('reel', 'ig', 'bottom-right', 'caption'), {}, 'caption-queue'),
        ('generateReels', ('reel', 'ig', 'bottom-right'), {'target': 'caption'}, 'caption-queue'),
        ('publishDistribution', ('distribution',), {}, 'publish-queue'),
        ('checkScheduledDistributions', (), {}, 'scheduler-queue'),
        ('syncTrackingData', (), {}, 'sync-queue'),
    ):
        assert router.route({}, f'app.worker.{name}', args=args, kwargs=kwargs)['queue'].name == queue
