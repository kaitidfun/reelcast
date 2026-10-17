import asyncio
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException, UploadFile

from app.exceptions import VideoSizeExceededException, UnsupportedVideoFormatException
from app.services import upload_service, overlay_service
from app.routes import direct_upload_routes as direct
from app.routes import upload_routes
from app.models.models import Reel
from tests.unit.test_tracking import data


async def test_upload_copy_reads_bounded_chunks_and_removes_partial_files(tmp_path, monkeypatch):
    chunks = iter([b'x' * 4, b'x' * 4, b'x' * 4])
    file = SimpleNamespace(filename='video.mp4', size=None, read=AsyncMock(side_effect=lambda size: next(chunks, b'')))
    path = tmp_path / 'upload.mp4'
    import os
    monkeypatch.setattr(upload_service.tempfile, 'mkstemp', lambda **_: (os.open(path, os.O_CREAT | os.O_WRONLY), str(path)))
    monkeypatch.setattr(upload_service, 'MAX_VIDEO_SIZE_BYTES', 10)
    with pytest.raises(VideoSizeExceededException):
        await upload_service.copy_upload_to_temp(file)
    assert not path.exists()
    assert all(call.args == (1024 * 1024,) for call in file.read.call_args_list)


async def test_unknown_size_upload_is_copied_without_whole_file_reads():
    original = BytesIO(b'valid upload' * 1000)
    file = UploadFile(filename='test.mp4', file=original)
    path, size = await upload_service.copy_upload_to_temp(file)
    try:
        assert size == 12000 and Path(path).read_bytes() == original.getvalue()
    finally:
        Path(path).unlink()


async def test_probe_requires_video_and_enforces_timeout(monkeypatch):
    run = MagicMock(return_value=SimpleNamespace(stderr=b'Duration: 00:01:00.01, start: 0\nStream: Video: h264'))
    monkeypatch.setattr(upload_service.subprocess, 'run', run)
    assert await upload_service.probe_video_path('video.mp4') == 60.01
    assert run.call_args.kwargs['timeout'] == 30
    run.return_value.stderr = b'Duration: 00:00:01.00\nAudio: aac'
    with pytest.raises(UnsupportedVideoFormatException):
        await upload_service.probe_video_path('fake.mp4')


async def test_download_streams_and_cleans_up_after_network_failure(monkeypatch, tmp_path):
    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'first chunk'
            raise httpx.ReadError('connection lost')
    transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=Stream()))
    original = httpx.AsyncClient
    monkeypatch.setattr(overlay_service.httpx, 'AsyncClient', lambda **kwargs: original(transport=transport, **kwargs))
    import os
    path = tmp_path / 'download.mp4'
    monkeypatch.setattr(overlay_service.tempfile, 'mkstemp', lambda **_: (os.open(path, os.O_CREAT | os.O_WRONLY), str(path)))
    with pytest.raises(httpx.ReadError):
        await overlay_service.download_to_temp('https://media.test/video.mp4')
    assert not path.exists()


async def test_overlay_reuses_input_and_cleans_owned_files_only(monkeypatch, tmp_path):
    video = tmp_path / 'input.mp4'; video.write_bytes(b'video')
    logo = tmp_path / 'logo.png'; logo.write_bytes(b'logo')
    download = AsyncMock(return_value=str(logo))
    monkeypatch.setattr(overlay_service, 'download_to_temp', download)
    monkeypatch.setattr(overlay_service, 'overlay_watermark', AsyncMock())
    upload = MagicMock(return_value='final.mp4')
    monkeypatch.setattr(overlay_service, 'upload_path_to_r2', upload)
    result = await overlay_service.overlayImagesAndLogos('unused', 'https://media.test/logo.png',
                         'bottom-right', 'reel', local_video_path=str(video))
    assert result == 'final.mp4' and download.await_count == 1
    assert video.exists() and not logo.exists()
    assert not Path(upload.call_args.args[0]).exists()


@pytest.fixture
def multipart(data, monkeypatch):
    db, users, _, _ = data
    storage = MagicMock()
    storage.create_multipart_upload.return_value = {'UploadId': 'upload-1'}
    storage.generate_presigned_url.side_effect = lambda operation, **kw: f'https://r2.test/part/{kw["Params"]["PartNumber"]}'
    monkeypatch.setattr(direct.storage, '_get_s3_client', lambda: storage)
    monkeypatch.setattr(direct.config, 'DIRECT_VIDEO_UPLOAD_ENABLED', True)
    monkeypatch.setattr(direct, 'probe_video_path', AsyncMock(return_value=10))
    queue = MagicMock()
    monkeypatch.setattr(direct.generateReels, 'delay', queue)
    return db, users, storage, queue


def test_direct_upload_parts_are_owner_bound_and_completion_is_idempotent(multipart):
    db, users, storage, queue = multipart
    intent = direct.initiate_upload(direct.UploadIntent(filename='video.mp4', size=5), db, users[0])
    with pytest.raises(HTTPException) as error:
        direct.complete_upload(direct.CompleteUpload(token=intent['token'], parts=[{'part_number': 1, 'etag': 'etag'}]), db, users[1])
    assert error.value.status_code == 403
    storage.complete_multipart_upload.assert_not_called()
    storage.head_object.return_value = {'ContentLength': 5}
    storage.get_object.return_value = {'Body': BytesIO(b'video')}
    body = direct.CompleteUpload(token=intent['token'], parts=[{'part_number': 1, 'etag': 'etag'}])
    reel = direct.complete_upload(body, db, users[0])
    replay = direct.complete_upload(body, db, users[0])
    assert reel.reel_id == replay.reel_id
    assert queue.call_count == 1 and storage.complete_multipart_upload.call_count == 1
    assert reel.uploaded_video_url.startswith(f'videos/reels/uploads/users/{users[0].user_id}/')
    assert storage.generate_presigned_url.call_args.kwargs['Params']['ContentLength'] == 5


def test_direct_upload_rejects_missing_parts_before_completion(multipart):
    db, users, storage, _ = multipart
    intent = direct.initiate_upload(direct.UploadIntent(filename='video.mp4', size=direct.PART_SIZE + 1), db, users[0])
    assert len(intent['parts']) == 2
    with pytest.raises(HTTPException) as error:
        direct.complete_upload(direct.CompleteUpload(token=intent['token'], parts=[{'part_number': 1, 'etag': 'etag'}]), db, users[0])
    assert error.value.status_code == 422
    storage.complete_multipart_upload.assert_not_called()


def test_direct_upload_checks_actual_length_and_removes_invalid_object(multipart):
    db, users, storage, queue = multipart
    intent = direct.initiate_upload(direct.UploadIntent(filename='video.mp4', size=5), db, users[0])
    storage.head_object.return_value = {'ContentLength': 6}
    with pytest.raises(HTTPException) as error:
        direct.complete_upload(direct.CompleteUpload(token=intent['token'], parts=[{'part_number': 1, 'etag': 'etag'}]), db, users[0])
    assert error.value.status_code == 422
    storage.delete_object.assert_called_once()
    queue.assert_not_called()


def test_direct_upload_rechecks_product_ownership(multipart, data):
    db, users, _, _ = multipart
    other_product = data[3][1].reel.product_id
    with pytest.raises(HTTPException) as error:
        direct.initiate_upload(direct.UploadIntent(filename='video.mp4', size=5, product_id=other_product), db, users[0])
    assert error.value.status_code == 404


def test_configured_cdn_serves_media_without_reading_through_api(monkeypatch):
    monkeypatch.setattr(upload_routes, 'R2_PUBLIC_URL', 'https://media.test')
    get = MagicMock(); monkeypatch.setattr(upload_routes, 'get_file', get)
    response = upload_routes.serve_generic_image('products/a b.png')
    assert response.status_code == 307 and response.headers['location'] == 'https://media.test/products/a%20b.png'
    get.assert_not_called()


def test_reel_response_returns_direct_media_without_changing_persisted_keys(monkeypatch):
    from app.schemas.reel import ReelResponse
    from app.services import storage_service
    from uuid import uuid4
    sign = MagicMock(side_effect=lambda value: f'https://media.test/{value}')
    monkeypatch.setattr(storage_service, 'get_presigned_url', sign)
    response = ReelResponse(reel_id=uuid4(), prompt_text='Test', status='Completed', raw_video_url='raw/key.mp4')
    assert response.model_dump()['raw_video_url'] == 'https://media.test/raw/key.mp4'
    assert response.raw_video_url == 'raw/key.mp4'
    assert response.model_dump()['first_frame_url'] is None


async def test_worker_overlaps_caption_with_video_and_reuses_one_download(monkeypatch, tmp_path):
    from app import worker
    from app.models.models import Product
    caption_started, video_started = asyncio.Event(), asyncio.Event()
    reel = SimpleNamespace(reel_id='reel', product_id='product', prompt_text='Product motion',
                           caption_and_hashtags=None, uploaded_video_url=None)
    product = SimpleNamespace(product_name='Product', description='Description', images=[], brand_logo_url='logo.png')
    db = MagicMock()
    db.query.side_effect = lambda model: SimpleNamespace(
        filter=lambda *_: SimpleNamespace(first=lambda: reel if model is Reel else product),
        options=lambda *_: SimpleNamespace(filter=lambda *_: SimpleNamespace(first=lambda: product)),
    )
    monkeypatch.setattr(worker, 'SessionLocal', lambda: db)
    monkeypatch.setattr(worker, 'get_presigned_url', lambda value: f'https://media.test/{value}')
    async def caption(**_kwargs):
        caption_started.set()
        await video_started.wait()
        return {'caption': 'Ready', 'hashtags': []}
    async def video(**_kwargs):
        await asyncio.wait_for(caption_started.wait(), 1)
        video_started.set()
        return 'https://provider.test/raw.mp4', None
    path = tmp_path / 'raw.mp4'; path.write_bytes(b'video')
    download = AsyncMock(return_value=str(path))
    monkeypatch.setattr(worker, 'generateCaptionsAndHashtags', caption)
    monkeypatch.setattr(worker, '_run_ltx_generation', video)
    monkeypatch.setattr(worker, 'download_to_temp', download)
    persist = AsyncMock(return_value='raw-key.mp4')
    overlay = AsyncMock(return_value='final-key.mp4')
    monkeypatch.setattr(worker, '_upload_cdn_video_to_r2', persist)
    monkeypatch.setattr(worker, 'overlayImagesAndLogos', overlay)
    update = MagicMock(); monkeypatch.setattr(worker, 'update_reel', update)
    await asyncio.wait_for(worker._generateReels('reel', 'ig', 'bottom-right'), 2)
    assert caption_started.is_set() and video_started.is_set()
    assert download.await_count == 1
    assert persist.call_args.kwargs['local_path'] == str(path)
    assert overlay.call_args.kwargs['local_video_path'] == str(path)
    assert update.call_args.kwargs['status'] == 'Completed'
    assert update.call_args.kwargs['caption_and_hashtags']['caption'] == 'Ready'
    assert not path.exists()


@pytest.mark.parametrize('failure_stage', ['download', 'overlay'])
async def test_worker_keeps_uploaded_video_when_overlay_network_fails(monkeypatch, tmp_path, failure_stage):
    from app import worker

    reel = SimpleNamespace(reel_id='reel', product_id='product', prompt_text='',
                           caption_and_hashtags=None, uploaded_video_url='upload.mp4',
                           first_frame_url='thumb.png')
    product = SimpleNamespace(product_name='Product', description='', images=[], brand_logo_url='logo.png')
    db = MagicMock()
    db.query.side_effect = lambda model: SimpleNamespace(
        filter=lambda *_: SimpleNamespace(first=lambda: reel if model is Reel else product),
        options=lambda *_: SimpleNamespace(filter=lambda *_: SimpleNamespace(first=lambda: product)),
    )
    monkeypatch.setattr(worker, 'SessionLocal', lambda: db)
    monkeypatch.setattr(worker, 'get_presigned_url', lambda value: f'https://media.test/{value}')
    monkeypatch.setattr(worker, 'generateCaptionsAndHashtags',
                        AsyncMock(return_value={'caption': 'Ready', 'hashtags': []}))
    download = AsyncMock(side_effect=httpx.ReadError('temporary media failure'))
    overlay = AsyncMock(side_effect=httpx.ReadError('temporary media failure'))
    path = tmp_path / 'source.mp4'
    if failure_stage == 'overlay':
        # The worker reuses the source; the overlay's own logo download fails.
        download.side_effect = None
        path.write_bytes(b'video')
        download.return_value = str(path)
    monkeypatch.setattr(worker, 'download_to_temp', download)
    monkeypatch.setattr(worker, 'overlayImagesAndLogos', overlay)
    update = MagicMock()
    monkeypatch.setattr(worker, 'update_reel', update)

    await worker._generateReels('reel', 'ig', 'bottom-right', target='upload')

    assert update.call_args.kwargs['status'] == 'Completed'
    assert update.call_args.kwargs['final_commercial_video_url'] == 'upload.mp4'
    assert update.call_args.kwargs['caption_and_hashtags']['caption'] == 'Ready'
    assert not any(call.kwargs.get('status') == 'Failed' for call in update.call_args_list)
    if failure_stage == 'download':
        overlay.assert_not_awaited()
    assert not path.exists()
    db.close.assert_called_once()


def test_reel_routes_serialize_live_and_saved_media_without_changing_database(data, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.dependencies import get_current_user, get_db
    from app.routes.reel_routes import router
    from app.services import storage_service

    db, users, _, distributions = data
    reel = distributions[0].reel
    reel.name = 'My saved Reel'
    reel.status = 'Completed'
    reel.is_saved = True
    reel.prompt_text = 'Live prompt'
    reel.saved_prompt_text = 'Saved prompt'
    fields = ('raw_video_url', 'first_frame_url', 'final_commercial_video_url')
    for field in fields:
        setattr(reel, field, f'live/{field}')
        setattr(reel, f'saved_{field}', f'saved/{field}')
    db.commit()
    sign = MagicMock(side_effect=lambda value: f'https://media.test/{value}')
    monkeypatch.setattr(storage_service, 'get_presigned_url', sign)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]

    with TestClient(app) as client:
        status = client.get(f'/api/reels/{reel.reel_id}/status')
        listing = client.get('/api/reels')
        assert status.status_code == listing.status_code == 200
        live, saved = status.json(), listing.json()['reels'][0]
        for field in fields:
            assert live[field] == f'https://media.test/live/{field}'
            assert saved[field] == f'https://media.test/saved/{field}'
        assert live['prompt_text'] == 'Live prompt'
        assert saved['prompt_text'] == 'Saved prompt'
        assert saved['name'] == 'My saved Reel'
        assert saved['has_distribution'] is True and saved['is_saved'] is True
        assert saved['product_id'] == str(reel.product_id)
        sign.reset_mock()
        assert client.get(f'/api/reels/{distributions[1].reel.reel_id}/status').status_code == 404
        sign.assert_not_called()

    db.refresh(reel)
    for field in fields:
        assert getattr(reel, field) == f'live/{field}'
        assert getattr(reel, f'saved_{field}') == f'saved/{field}'


def test_library_pagination_search_and_deep_links_remain_member_scoped(data):
    from app.models.models import Campaign, Product
    from app.routes.library_routes import router
    from app.dependencies import get_current_user, get_db
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from uuid import uuid4
    db, users, _, _ = data
    for index in range(22):
        campaign = Campaign(campaign_id=uuid4(), user_id=users[0].user_id, name=f'Extra {index:02}')
        db.add(campaign)
        db.add(Product(product_id=uuid4(), campaign_id=campaign.campaign_id,
                       user_id=users[0].user_id, product_name=f'Product {index:02}'))
    db.commit()
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    with TestClient(app) as client:
        first = client.get('/api/library?limit=20&sortOption=Name').json()
        second = client.get('/api/library?limit=20&skip=20&sortOption=Name').json()
        assert first['total'] == second['total'] == 23
        assert len(first['campaigns']) == 20 and len(second['campaigns']) == 3
        first_ids = {c['campaign_id'] for c in first['campaigns']}
        assert not first_ids.intersection(c['campaign_id'] for c in second['campaigns'])
        assert all(p['campaign_id'] in first_ids for p in first['products'])
        search = client.get('/api/library?limit=20&searchKeyword=Product%2021').json()
        assert search['total'] == 1 and search['products'][0]['product_name'] == 'Product 21'
        foreign = db.query(Campaign).filter(Campaign.user_id == users[1].user_id).first()
        assert not client.get(f'/api/library?limit=1&campaign_id={foreign.campaign_id}').json()['campaigns']
