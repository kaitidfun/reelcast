"""Read-only checks before starting production workers; never print secrets."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from redis import Redis
from sqlalchemy import inspect, text
from app.database import Base, engine
from app.models import models  # noqa: F401 -- register model metadata
from app.core import config
import os


def main():
    with engine.connect() as connection:
        connection.execute(text('SELECT 1'))
        inspector = inspect(connection)
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                raise RuntimeError(f'Missing table: {table.name}')
            actual = {column['name'] for column in inspector.get_columns(table.name)}
            missing = set(table.columns.keys()) - actual
            if missing:
                raise RuntimeError(f'Missing columns in {table.name}: {sorted(missing)}')
    print('Database connected; all model tables and columns exist.')
    for key in ('CELERY_BROKER_URL', 'CELERY_RESULT_BACKEND'):
        client = Redis.from_url(os.environ[key], socket_connect_timeout=5, socket_timeout=5)
        try:
            assert client.ping(), f'{key} did not respond'
        finally:
            client.close()
    print('Celery broker and result backend respond to PING.')
    with httpx.Client(timeout=10) as client:
        for platform in ('TIKTOK', 'YOUTUBE', 'FACEBOOK', 'INSTAGRAM'):
            url = getattr(config, f'TRACKING_{platform}_SYNC_URL')
            if not url:
                raise RuntimeError(f'Missing tracking URL for {platform}')
            health = httpx.URL(url).copy_with(path='/health', query=None)
            client.get(health).raise_for_status()
    print('Tracking adapter reachable. Provider credentials still require a real sync test.')


if __name__ == '__main__':
    main()
