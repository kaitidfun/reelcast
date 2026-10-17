"""Benchmark owned tracking reads in disposable SQLite, never the configured DB.

Run from backend: python scripts/benchmark_tracking.py --compare-ref HEAD
The optional ref loads ONLY the prior detail_rows function for comparison.
"""
import argparse
import ast
from datetime import date, datetime, timezone
import json
from pathlib import Path
from statistics import median
import subprocess
import sys
from time import perf_counter
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from app.database import Base
from app.models.models import User, SocialAccount, Reel, Distribution, TrackingLink, TrackingObservation, TrackingClick
from app.services import tracking_service as service


@compiles(JSONB, 'sqlite')
def json_type(_type, _compiler, **_kwargs):
    return 'JSON'


def baseline_reader(ref):
    source = subprocess.run(
        ['git', 'show', f'{ref}:backend/app/services/tracking_service.py'],
        cwd=Path(__file__).resolve().parents[2], check=True, capture_output=True, text=True,
    ).stdout
    function = next(node for node in ast.parse(source).body
                    if isinstance(node, ast.FunctionDef) and node.name == 'detail_rows')
    namespace = dict(vars(service))
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<baseline detail_rows>', 'exec'), namespace)
    return namespace['detail_rows']


def benchmark(size, baseline=None):
    engine = create_engine('sqlite://')
    try:
        Base.metadata.create_all(engine)
        with Session(engine, expire_on_commit=False) as db:
            user = User(user_id=uuid4(), display_name='Benchmark')
            account = SocialAccount(account_id=uuid4(), user_id=user.user_id,
                                    platform_name='youtube', access_token='unused')
            db.add_all([user, account]); db.flush()
            for index in range(size):
                reel = Reel(reel_id=uuid4(), user_id=user.user_id, prompt_text='Benchmark')
                distribution = Distribution(distribution_id=uuid4(), reel_id=reel.reel_id,
                                            account_id=account.account_id, status='Published')
                link = TrackingLink(link_id=uuid4(), user_id=user.user_id,
                                    distribution_id=distribution.distribution_id, code=f'benchmark-{index}',
                                    destination='https://example.test', created_at=datetime(2025, 12, 1, tzinfo=timezone.utc))
                db.add_all([reel, distribution, link]); db.flush()
                db.add(TrackingClick(link_id=link.link_id, clicked_at=datetime(2026, 1, 3, tzinfo=timezone.utc)))
                for day in range(1, 31):
                    db.add(TrackingObservation(observation_id=uuid4(), user_id=user.user_id,
                                              account_id=account.account_id, distribution_id=distribution.distribution_id,
                                              platform='youtube', external_ref=f'post-{index}', observed_date=date(2026, 1, day),
                                              observed_at=datetime(2026, 1, day, tzinfo=timezone.utc), views=day))
            db.commit()
            results = {}
            expected = None
            for label, reader in [('before', baseline), ('after', service.detail_rows)]:
                if reader is None:
                    continue
                samples, statements = [], []
                def executed(_conn, _cursor, statement, _params, _context, _many):
                    if statement.lstrip().upper().startswith('SELECT'):
                        statements.append(statement)
                event.listen(engine, 'after_cursor_execute', executed)
                try:
                    for _ in range(3):
                        db.expunge_all(); statements.clear()
                        started = perf_counter()
                        rows = reader(db, user_id=user.user_id)
                        samples.append((perf_counter() - started) * 1000)
                    assert len(rows) == size
                    assert sum(row['views'] for row in rows) == size * 30
                    assert sum(row['clicks'] for row in rows) == size
                    values = {row['distribution_id']: row for row in rows}
                    if expected is not None:
                        assert values == expected, 'optimization changed report values'
                    expected = values
                    results[label] = dict(queries=len(statements), median_ms=round(median(samples), 2))
                finally:
                    event.remove(engine, 'after_cursor_execute', executed)
            return dict(links=size, observations=size * 30, **results)
    finally:
        engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compare-ref')
    arguments = parser.parse_args()
    previous = baseline_reader(arguments.compare_ref) if arguments.compare_ref else None
    for size in (10, 100, 1000):
        print(json.dumps(benchmark(size, previous)), flush=True)
