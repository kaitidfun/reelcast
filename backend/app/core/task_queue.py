"""Lightweight Celery client shared by API producers and workers."""
import os
from celery import Celery
from app.core import config as _config  # noqa: F401 -- load service .env before reading broker settings
from app.core import task_performance  # noqa: F401 -- stamp enqueue timings

celery_app = Celery('worker',
    broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'))
celery_app.conf.broker_connection_timeout = 1
celery_app.conf.broker_transport_options = {'socket_connect_timeout': 1, 'socket_timeout': 5, 'retry_on_timeout': False}
