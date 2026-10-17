"""Add only the durable social-sync tables/columns. Safe to run repeatedly."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect, text
from app.database import engine, Base
from app.models.models import TrackingSyncRun, TrackingSyncJob, TrackingSyncGate


def migrate():
    with engine.begin() as connection:
        if connection.dialect.name == 'postgresql':
            connection.execute(text('SELECT pg_advisory_xact_lock(786513021)'))
        inspector = inspect(connection)
        fresh = not inspector.has_table('users') or not inspector.has_table('social_accounts')
        # Fresh installations use the same full metadata bootstrap as app.main;
        # existing installations add only the three new sync tables.
        Base.metadata.create_all(connection, tables=None if fresh else
            [TrackingSyncRun.__table__, TrackingSyncJob.__table__, TrackingSyncGate.__table__])
        columns = {column['name'] for column in inspect(connection).get_columns('tracking_sync_jobs')}
        # Complete intermediate local versions without changing observations.
        if 'tokens_refreshed' not in columns:
            connection.execute(text('ALTER TABLE tracking_sync_jobs ADD COLUMN IF NOT EXISTS tokens_refreshed BOOLEAN NOT NULL DEFAULT FALSE'))
        if 'provider_cursor' not in columns:
            connection.execute(text('ALTER TABLE tracking_sync_jobs ADD COLUMN IF NOT EXISTS provider_cursor JSONB'))


if __name__ == '__main__':
    migrate()
    print('Tracking sync schema is ready')
