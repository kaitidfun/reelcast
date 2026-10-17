"""Optional browser-to-R2 multipart uploads with owner-bound completion tokens."""
import asyncio
from datetime import timedelta
import math
import os
import tempfile
from uuid import UUID, uuid4

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import config
from app.dependencies import get_current_user, get_db
from app.models.models import Product, Reel, User
from app.schemas.reel import ReelResponse
from app.services import storage_service as storage
from app.services.auth_service import create_access_token
from app.services.upload_service import ALLOWED_VIDEO_FORMATS, MAX_VIDEO_SIZE_BYTES, probe_video_path
from app.worker import generateReels

router = APIRouter(prefix='/api/reel-uploads', tags=['Reel uploads'])
PART_SIZE = 8 * 1024 * 1024


class UploadIntent(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0, le=MAX_VIDEO_SIZE_BYTES)
    product_id: UUID | None = None
    platform: str = Field(default='ig', pattern='^(ig|fb|tt|yt)$')
    overlay_position: str = Field(default='bottom-right', pattern='^(top-left|top-right|bottom-left|bottom-right|center)$')


class UploadedPart(BaseModel):
    part_number: int = Field(ge=1, le=63)
    etag: str = Field(min_length=1, max_length=128)


class CompleteUpload(BaseModel):
    token: str = Field(max_length=4096)
    parts: list[UploadedPart] = Field(min_length=1, max_length=63)


class AbortUpload(BaseModel):
    token: str = Field(max_length=4096)


def _owned_product(db, user_id, product_id):
    if product_id and not db.query(Product).filter(Product.product_id == product_id,
            Product.user_id == user_id, Product.deleted_at.is_(None)).first():
        raise HTTPException(404, 'Product not found')


def _claims(token, user_id):
    try:
        claims = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        if claims.get('type') != 'reel_upload' or claims.get('owner') != str(user_id):
            raise ValueError('Wrong upload owner')
        UUID(claims['reel_id'])
        return claims
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(403, 'Invalid or expired upload') from exc


@router.post('/init')
def initiate_upload(body: UploadIntent, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not config.DIRECT_VIDEO_UPLOAD_ENABLED:
        raise HTTPException(409, 'Direct upload is not enabled')
    _owned_product(db, user.user_id, body.product_id)
    extension = os.path.splitext(body.filename)[1].lower()
    if extension not in ALLOWED_VIDEO_FORMATS:
        raise HTTPException(422, 'Unsupported video format')
    reel_id = str(uuid4())
    key = f'videos/reels/uploads/users/{user.user_id}/direct/{reel_id}{extension}'
    client = storage._get_s3_client()
    upload_id = client.create_multipart_upload(Bucket=config.R2_BUCKET_NAME, Key=key,
                        ContentType=storage._guess_content_type(body.filename))['UploadId']
    claims = dict(type='reel_upload', owner=str(user.user_id), key=key, upload_id=upload_id,
                  reel_id=reel_id, **body.model_dump(mode='json'))
    try:
        parts = [dict(part_number=index + 1, url=client.generate_presigned_url('upload_part', Params=dict(
                    Bucket=config.R2_BUCKET_NAME, Key=key, UploadId=upload_id, PartNumber=index + 1,
                    ContentLength=min(PART_SIZE, body.size - index * PART_SIZE)), ExpiresIn=1800))
                 for index in range(math.ceil(body.size / PART_SIZE))]
        return dict(token=create_access_token(claims, expires_delta=timedelta(minutes=30)),
                    part_size=PART_SIZE, parts=parts)
    except Exception:
        client.abort_multipart_upload(Bucket=config.R2_BUCKET_NAME, Key=key, UploadId=upload_id)
        raise


@router.post('/complete', response_model=ReelResponse)
def complete_upload(body: CompleteUpload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    claims = _claims(body.token, user.user_id)
    reel_id = UUID(claims['reel_id'])
    existing = db.query(Reel).filter(Reel.reel_id == reel_id, Reel.user_id == user.user_id).first()
    if existing:
        return existing
    _owned_product(db, user.user_id, UUID(claims['product_id']) if claims.get('product_id') else None)
    expected = math.ceil(claims['size'] / PART_SIZE)
    parts = sorted(body.parts, key=lambda item: item.part_number)
    if [part.part_number for part in parts] != list(range(1, expected + 1)):
        raise HTTPException(422, 'Missing or duplicate upload parts')
    client = storage._get_s3_client()
    params = dict(Bucket=config.R2_BUCKET_NAME, Key=claims['key'])
    try:
        client.complete_multipart_upload(**params, UploadId=claims['upload_id'],
            MultipartUpload={'Parts': [dict(PartNumber=p.part_number, ETag=p.etag) for p in parts]})
    except ClientError as exc:
        raise HTTPException(409, 'Upload cannot be completed; retry or start a new upload') from exc

    # Parts are immutable after completion. Check actual length and stream to a
    # temporary file for media validation before creating a processable Reel.
    fd, path = tempfile.mkstemp(suffix=os.path.splitext(claims['filename'])[1])
    os.close(fd)
    try:
        if client.head_object(**params)['ContentLength'] != claims['size']:
            raise HTTPException(422, 'Uploaded file size does not match')
        response = client.get_object(**params)
        try:
            size = 0
            with open(path, 'wb') as output:
                while chunk := response['Body'].read(1024 * 1024):
                    size += len(chunk)
                    if size > claims['size']:
                        raise HTTPException(422, 'Uploaded file is too large')
                    output.write(chunk)
            if size != claims['size']:
                raise HTTPException(422, 'Incomplete video upload')
        finally:
            response['Body'].close()
        if asyncio.run(probe_video_path(path)) > 60:
            raise HTTPException(422, 'Video duration exceeds 60 seconds')
    except Exception:
        client.delete_object(**params)
        raise
    finally:
        os.remove(path)
    reel = Reel(reel_id=reel_id, user_id=user.user_id,
                product_id=UUID(claims['product_id']) if claims.get('product_id') else None,
                prompt_text='', uploaded_video_url=claims['key'])
    db.add(reel)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.query(Reel).filter(Reel.reel_id == reel_id, Reel.user_id == user.user_id).one()
    db.refresh(reel)
    try:
        generateReels.delay(str(reel_id), claims['platform'], claims['overlay_position'], 'upload', with_audio=True)
    except Exception as exc:
        reel.status = 'Failed'; reel.error_message = 'Unable to queue processing; please retry'
        db.commit()
        raise HTTPException(503, 'Processing queue is unavailable') from exc
    return reel


@router.post('/abort')
def abort_upload(body: AbortUpload, user: User = Depends(get_current_user)):
    claims = _claims(body.token, user.user_id)
    try:
        storage._get_s3_client().abort_multipart_upload(Bucket=config.R2_BUCKET_NAME,
                        Key=claims['key'], UploadId=claims['upload_id'])
    except ClientError as exc:
        if exc.response.get('Error', {}).get('Code') != 'NoSuchUpload':
            raise
    return {'aborted': True}
