import csv
import io
from datetime import date, datetime, timezone
from unittest.mock import patch
from uuid import uuid4
from zipfile import ZipFile
from xml.etree import ElementTree

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.database import Base
from app.dependencies import get_current_user, get_db
from app.models.models import User, Campaign, Product, Reel, SocialAccount, Distribution, TrackingObservation, TrackingClick
from app.routes.tracking_routes import router
from app.services import tracking_service as service, tracking_provider_service as provider

@compiles(JSONB, 'sqlite')
def compile_json(type_, compiler, **kw):
    return 'JSON'

@pytest.fixture
def data():
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        users, accounts, distributions = [], [], []
        for _ in range(2):
            user = User(user_id=uuid4(), display_name='Member')
            campaign = Campaign(campaign_id=uuid4(), user_id=user.user_id, name='แคมเปญ')
            product = Product(product_id=uuid4(), campaign_id=campaign.campaign_id, user_id=user.user_id,
                              product_name='001สินค้า', affiliate_link='https://example.com/?aff=001&x=%2F')
            account = SocialAccount(account_id=uuid4(), user_id=user.user_id, platform_name='youtube', access_token='encrypted')
            reel = Reel(reel_id=uuid4(), user_id=user.user_id, product_id=product.product_id,
                        prompt_text='=BAD()', saved_prompt_text='=BAD()')
            distribution = Distribution(distribution_id=uuid4(), reel_id=reel.reel_id, account_id=account.account_id,
                                        platform_post_id='same', status='Published')
            db.add_all([user, campaign, product, account, reel, distribution])
            users.append(user); accounts.append(account); distributions.append(distribution)
        db.commit()
        yield db, users, accounts, distributions
    engine.dispose()

def observe(db, user, account, views, day):
    service.record_metric(db, user_id=user.user_id, social_account_id=account.account_id,
                          source_platform='youtube', external_ref='youtube:same', views=views, likes=0,
                          observed_at=datetime(2026, 1, day, 10, tzinfo=timezone.utc))
    db.commit()


def test_dashboard_query_count_stays_constant_as_links_and_history_grow(data):
    db, users, accounts, distributions = data
    user_id = users[0].user_id
    account_id = accounts[0].account_id
    product_id = distributions[0].reel.product_id
    service.ensure_tracking_link(db, user_id=user_id, distribution_id=distributions[0].distribution_id)

    def measure():
        statements = []
        def executed(_conn, _cursor, statement, _params, _context, _many):
            if statement.lstrip().upper().startswith('SELECT'):
                statements.append(statement)
        event.listen(db.get_bind(), 'after_cursor_execute', executed)
        try:
            result = service.dashboard(db, user_id=user_id)
        finally:
            event.remove(db.get_bind(), 'after_cursor_execute', executed)
        return result, len(statements)

    _, baseline = measure()
    for index in range(100):
        reel = Reel(reel_id=uuid4(), user_id=user_id, product_id=product_id, prompt_text='Load test')
        distribution = Distribution(distribution_id=uuid4(), reel_id=reel.reel_id, account_id=account_id,
                                    platform_post_id=f'load-{index}', status='Published')
        db.add_all([reel, distribution]); db.flush()
        link = service.ensure_tracking_link(db, user_id=user_id, distribution_id=distribution.distribution_id)
        db.add(TrackingClick(link_id=link.link_id, clicked_at=datetime(2026, 1, 2, 17, tzinfo=timezone.utc)))
        for day, views in ((1, 10), (2, 20), (3, 30)):
            db.add(TrackingObservation(observation_id=uuid4(), user_id=user_id, account_id=account_id,
                                      distribution_id=distribution.distribution_id, platform='youtube',
                                      external_ref=f'youtube:load-{index}', observed_date=date(2026, 1, day),
                                      observed_at=datetime(2026, 1, day, 10, tzinfo=timezone.utc), views=views))
    db.commit()
    report, expanded = measure()
    assert expanded == baseline == 5
    assert len(report['details']) == 101
    assert report['totals']['views'] == 3000  # latest snapshots, not the sum of all days
    assert report['totals']['clicks'] == 100
    assert report['click_trend'][0]['date'] == '2026-01-03'
    assert report['click_trend'][0]['clicks'] == 100


def test_comparison_export_reads_each_period_only_once(data):
    db, users, accounts, _ = data
    observe(db, users[0], accounts[0], 10, 1)
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    with patch.object(service, 'detail_rows', wraps=service.detail_rows) as details:
        response = TestClient(app).get('/api/tracking/export', params=dict(
            a_start='2026-01-01', a_end='2026-01-07', b_start='2026-01-08', b_end='2026-01-14'))
    assert response.status_code == 200
    assert details.call_count == 2


def test_regeneration_claim_prevents_caption_and_video_from_overwriting_each_other(data):
    from app.services.reel_service import claim_regeneration
    db, users, _, distributions = data
    reel = distributions[0].reel
    reel.status = 'Completed'; db.commit()
    assert claim_regeneration(db, reel=reel, user_id=users[0].user_id, target='video', prompt_text='New prompt')
    assert not claim_regeneration(db, reel=reel, user_id=users[0].user_id, target='caption')
    db.refresh(reel)
    assert reel.prompt_text == 'New prompt' and reel.retry_count == 1 and reel.status == 'Generating'

# F5-UTC06-TC01, F5-UTC06-TC02, F5-UTC06-TC03
def test_snapshots_are_idempotent_and_members_isolated(data):
    db, users, accounts, _ = data
    observe(db, users[0], accounts[0], 10, 1)
    observe(db, users[0], accounts[0], 12, 1)
    observe(db, users[0], accounts[0], 20, 2)
    observe(db, users[1], accounts[1], 99, 1)
    assert db.query(TrackingObservation).count() == 3
    totals = service.dashboard(db, user_id=users[0].user_id)['totals']
    assert totals['views'] == 20 and totals['likes'] == 0 and totals['comments'] is None
    assert service.dashboard(db, user_id=users[1].user_id)['totals']['views'] == 99
    assert service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,1), end=date(2026,1,1))['totals']['views'] == 12
    with pytest.raises(LookupError):
        observe(db, users[1], accounts[0], 1000, 1)

@pytest.mark.parametrize('metric,title,expected', [
    ('views', 'Views', 20), ('likes', 'Likes', 4), ('comments', 'Comments', 0),
    ('shares', 'Shares', None), ('clicks', 'Affiliate Link Clicks', 0),
])
# F5-UTC07-TC01, F5-UTC07-TC02, F5-UTC07-TC03, F5-UTC07-TC04, F5-UTC07-TC05
def test_ranking_metrics_and_exports(data, metric, title, expected):
    db, users, accounts, _ = data
    service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                          source_platform='youtube', external_ref='youtube:same',
                          views=20, likes=4, comments=0, shares=None)
    db.commit()
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    with TestClient(app) as client:
        response = client.get('/api/tracking/analysis', params={'level': 'reel', 'metric': metric})
        assert response.status_code == 200
        rows = response.json()['rows']
        assert len(rows) == 1 and rows[0]['value'] == expected
        export = client.get('/api/tracking/export', params={'format': 'csv', 'level': 'reel', 'metric': metric})
        assert export.status_code == 200
        exported = list(csv.DictReader(io.StringIO(export.content.decode('utf-8-sig'))))
        assert exported[0][title] == ('Unavailable' if expected is None else str(expected))


def test_redirect_click_rules_period_boundaries_and_missing_coverage(data):
    db, users, _, distributions = data
    link = service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)
    assert service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id).code == link.code
    with pytest.raises(LookupError):
        service.ensure_tracking_link(db, user_id=users[1].user_id, distribution_id=distributions[0].distribution_id)
    for method, agent, purpose in [('HEAD','Browser',''),('GET','Googlebot',''),('GET','Browser','prefetch')]:
        service.follow_link(db, code=link.code, method=method, user_agent=agent, purpose=purpose)
    assert db.query(TrackingClick).count() == 0
    for _ in range(2):
        assert service.follow_link(db, code=link.code) == 'https://example.com/?aff=001&x=%2F'
    assert db.query(TrackingClick).count() == 2
    db.query(TrackingClick).delete()
    link.created_at = datetime(2025,12,31,tzinfo=timezone.utc)
    db.add_all([TrackingClick(link_id=link.link_id, clicked_at=datetime(2026,1,1,17,tzinfo=timezone.utc)) for _ in range(3)])
    db.add_all([TrackingClick(link_id=link.link_id, clicked_at=datetime(2026,1,2,17,tzinfo=timezone.utc)) for _ in range(6)])
    db.commit()
    periods = dict(a_start=date(2026,1,2), a_end=date(2026,1,2), b_start=date(2026,1,3), b_end=date(2026,1,3))
    result = service.compare_periods(db, user_id=users[0].user_id, **periods)
    assert (result['a']['clicks'], result['b']['clicks'], result['difference'], result['percentage_change']) == (3,6,3,100)
    periods.update(a_start=date(2026,1,1), a_end=date(2026,1,1))
    result = service.compare_periods(db, user_id=users[0].user_id, **periods)
    assert result['difference'] == 6 and result['percentage_change'] is None
    link.created_at = datetime(2026,1,2,tzinfo=timezone.utc); db.commit()
    assert service.compare_periods(db, user_id=users[0].user_id, **periods)['difference'] == 6

@pytest.mark.parametrize('a_clicks,b_clicks,partial,b_end', [
    (3, 6, False, '2026-01-14'),
    (0, 6, False, '2026-01-14'),
    (6, 3, False, '2026-01-14'),
    (3, 6, True, '2026-01-14'),
    (3, 6, False, '2026-01-15'),
])
@pytest.mark.parametrize('include_dashboard_dates', [False, True])
# F5-UTC08-TC01, F5-UTC08-TC02, F5-UTC08-TC08; F5-UTC09-TC04
def test_comparison_exports_preserve_api_summary(data, a_clicks, b_clicks, partial, b_end, include_dashboard_dates):
    db, users, _, distributions = data
    link = service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)
    link.created_at = datetime(2026, 1, 5, tzinfo=timezone.utc) if partial else datetime(2025, 12, 30, tzinfo=timezone.utc)
    for day, count in ((6, a_clicks), (9, b_clicks)):
        db.add_all([TrackingClick(link_id=link.link_id, clicked_at=datetime(2026, 1, day, 10, tzinfo=timezone.utc))
                    for _ in range(count)])
    db.commit()
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    params = dict(a_start='2026-01-01', a_end='2026-01-07', b_start='2026-01-08', b_end=b_end)
    if include_dashboard_dates:
        params.update(start=params['a_start'], end=params['a_end'])
    with patch('app.services.tracking_service.datetime', wraps=datetime) as clock:
        clock.now.return_value = datetime(2026, 2, 1, tzinfo=timezone.utc)
        comparison_response = client.get('/api/tracking/comparison', params=params)
        response = client.get('/api/tracking/export', params=dict(params, format='csv'))
        xlsx_response = client.get('/api/tracking/export', params=dict(params, format='xlsx', metric='views'))
    assert comparison_response.status_code == response.status_code == xlsx_response.status_code == 200
    comparison = comparison_response.json()
    assert comparison['a']['clicks'] == a_clicks and comparison['b']['clicks'] == b_clicks
    assert comparison['a']['complete'] is not partial
    assert comparison['difference'] == b_clicks - a_clicks
    assert comparison['percentage_change'] == (None if not a_clicks else round((b_clicks-a_clicks)/a_clicks*100, 2))
    assert response.content.startswith(b'\xef\xbb\xbf')
    rows = list(csv.DictReader(io.StringIO(response.content.decode('utf-8-sig'))))
    assert len(rows) == 2 and {row['Comparison Period'] for row in rows} == {'A', 'B'}
    for row in rows:
        assert None not in row  # Every row has the same number of columns.
        for period in ('a', 'b'):
            label = period.upper()
            expected = comparison[period]
            assert row[f'Comparison {label} Start'] == expected['start']
            assert row[f'Comparison {label} End'] == expected['end']
            assert row[f'Comparison {label} Total Clicks'] == str(expected['clicks'])
            assert row[f'Comparison {label} Coverage'] == ('Complete' if expected['complete'] else 'Partial coverage')
        for column, key in [('Comparison Click Difference (B - A)', 'difference'),
                            ('Comparison Percentage Change (%)', 'percentage_change')]:
            assert row[column] == ('Unavailable' if comparison[key] is None else str(comparison[key]))
        assert row['Comparison Equal Duration'] == ('Yes' if comparison['equal_duration'] else 'No')
        assert row['Comparison Coverage Start'] == comparison['coverage_start']
        assert row['Comparison Timezone'] == 'Asia/Bangkok'
        assert row['Comparison Metric'] == 'Affiliate link clicks'
        assert row['Comparison Limitation'] == comparison['limitation']
        assert row['Reel Name'].startswith("'=")
        assert 'สินค้า' in row['Product Name']
        assert row['Period Start'] == comparison[row['Comparison Period'].lower()]['start']
    assert sum(int(row['Affiliate Link Clicks']) for row in rows) == a_clicks + b_clicks
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with ZipFile(io.BytesIO(xlsx_response.content)) as archive:
        summary_root = ElementTree.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        summary = {}
        for row in summary_root.findall('s:sheetData/s:row', ns):
            cells = [cell.findtext('s:is/s:t', namespaces=ns) if cell.get('t') == 'inlineStr'
                     else cell.findtext('s:v', namespaces=ns) for cell in row]
            summary[cells[0]] = cells[1]
        assert summary['Metric'] == 'Affiliate link clicks'
        assert 'Date Range' not in summary and 'Start' not in summary and 'End' not in summary
        assert summary['Timezone'] == 'Asia/Bangkok'
        for period in ('a', 'b'):
            expected = comparison[period]
            label = f'Period {period.upper()}'
            assert summary[f'{label} Start'] == expected['start']
            assert summary[f'{label} End'] == expected['end']
            assert summary[f'{label} Days'] == str((date.fromisoformat(expected['end']) - date.fromisoformat(expected['start'])).days + 1)
            assert summary[f'{label} Coverage'] == ('Complete' if expected['complete'] else 'Partial coverage')
        assert summary['Period A clicks'] == str(a_clicks)
        assert summary['Period B clicks'] == str(b_clicks)
        for column, key in [('Difference', 'difference'), ('Percentage change (%)', 'percentage_change')]:
            assert summary[column] == ('Unavailable' if comparison[key] is None else str(comparison[key]))
        assert summary['Equal Duration'] == ('Yes' if comparison['equal_duration'] else 'No')
        assert summary['Duration Note'] == ('Periods have equal durations.' if comparison['equal_duration'] else 'Periods have different durations.')
        assert summary['Comparison Limitation'] == comparison['limitation']
        assert summary['Coverage Start (Asia/Bangkok)'] == ('05 Jan 2026, 07:00:00' if partial else '30 Dec 2025, 07:00:00')
        if partial:
            assert summary['Comparison Status'].startswith('Partial coverage:')
            assert summary['Percentage Change Status'] == 'Available'
        elif not a_clicks:
            assert summary['Percentage Change Status'] == 'Unavailable: Period A has zero clicks.'
        else:
            assert summary['Comparison Status'] == 'Completed periods with full coverage'
            assert summary['Percentage Change Status'] == 'Available'


@pytest.mark.parametrize('format', ['csv', 'xlsx'])
def test_comparison_export_pairs_publications_across_periods(format):
    from app.services.tracking_export_service import report_bytes
    comparison = dict(
        a=dict(start='2026-01-01', end='2026-01-07', clicks=0, complete=True),
        b=dict(start='2026-01-08', end='2026-01-14', clicks=0, complete=True),
        difference=0, percentage_change=None, equal_duration=True,
        coverage_start='2025-12-01T00:00:00+00:00', limitation='Test coverage',
    )
    publications = [
        ('late', 'reel-1', '2025-12-03T00:00:00', 'youtube'),
        ('early', 'reel-1', '2025-12-01T00:00:00', 'youtube'),
        ('same-time-other-reel', 'reel-2', '2025-12-03T00:00:00', 'youtube'),
        ('same-time-other-platform', 'reel-1', '2025-12-03T00:00:00', 'tiktok'),
        ('undated', 'reel-3', None, 'youtube'),
    ]
    source = []
    for period in ('B', 'A'):
        for ident, reel_id, timestamp, platform in publications:
            if ident == 'undated' and period == 'B':
                continue  # A publication present in only one period is retained.
            source.append(dict(distribution_id=ident, reel_id=reel_id,
                               reel_name='Same Reel Name', product_name=ident, campaign_name=None,
                               distribute_date=timestamp, platform=platform, clicks=0, engagement=17,
                               comparison_period=period, period_start=comparison[period.lower()]['start'],
                               period_end=comparison[period.lower()]['end']))
    original_order = [(row['distribution_id'], row['comparison_period']) for row in source]
    content = report_bytes(source, format=format, filters={}, comparison=comparison)
    if format == 'csv':
        records = list(csv.DictReader(io.StringIO(content.decode('utf-8-sig'))))
    else:
        with ZipFile(io.BytesIO(content)) as archive:
            root = ElementTree.fromstring(archive.read('xl/worksheets/sheet2.xml'))
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        values = [[cell.findtext('s:is/s:t', namespaces=ns) if cell.get('t') == 'inlineStr'
                   else cell.findtext('s:v', namespaces=ns) for cell in row]
                  for row in root.findall('s:sheetData/s:row', ns)]
        records = [dict(zip(values[0], row)) for row in values[1:]]
    assert 'Engagement' not in records[0]
    assert {'Views', 'Likes', 'Comments', 'Shares', 'Affiliate Link Clicks'} <= records[0].keys()
    assert [(row['Product Name'], row['Comparison Period']) for row in records] == [
        ('early', 'A'), ('early', 'B'),
        ('same-time-other-platform', 'A'), ('same-time-other-platform', 'B'),
        ('late', 'A'), ('late', 'B'),
        ('same-time-other-reel', 'A'), ('same-time-other-reel', 'B'),
        ('undated', 'A'),
    ]
    assert [(row['distribution_id'], row['comparison_period']) for row in source] == original_order


def test_comparison_overview_uses_latest_social_observation_in_each_period(data):
    db, users, accounts, _ = data
    observe(db, users[0], accounts[0], 10, 2)
    observe(db, users[0], accounts[0], 12, 6)
    observe(db, users[0], accounts[0], 20, 10)
    observe(db, users[1], accounts[1], 99, 10)
    result = service.compare_periods(db, user_id=users[0].user_id,
                                     a_start=date(2026,1,1), a_end=date(2026,1,7),
                                     b_start=date(2026,1,8), b_end=date(2026,1,14))
    assert result['a']['social']['views'] == 12
    assert result['b']['social']['views'] == 20
    assert result['a']['social']['likes'] == 0
    assert result['a']['social']['shares'] == 0
    assert 'shares' in result['a']['social']['partial_metrics']
    assert result['social_comparison'] is None
    assert result['difference'] == 0  # Growth uses recorded values even without full coverage.
    # Other Tracking components retain their own missing-data semantics.
    assert service.dashboard(db, user_id=users[0].user_id)['totals']['shares'] is None
    empty = service.compare_periods(db, user_id=users[0].user_id,
                                   a_start=date(2025,1,1), a_end=date(2025,1,7),
                                   b_start=date(2025,1,8), b_end=date(2025,1,14))
    for period in ('a', 'b'):
        assert all(empty[period]['social'][metric] == 0 for metric in service.SOCIAL_METRICS)


# F5-UTC09-TC01, F5-UTC09-TC02, F5-UTC09-TC03
def test_api_export_ownership_thai_formula_safety_and_redirect(data):
    db, users, accounts, distributions = data
    observe(db, users[0], accounts[0], 10, 1)
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    assert client.get('/api/tracking/export?start=2027-01-01').status_code == 404
    assert client.get('/api/tracking/export?reel_id='+str(distributions[1].reel_id)).status_code == 404
    assert client.get('/api/tracking/dashboard?platform=shopee').status_code == 422
    assert client.get('/api/tracking/dashboard?start=2026-02-01&end=2026-01-01').status_code == 422
    response = client.get('/api/tracking/export?format=csv')
    assert response.status_code == 200 and response.content.startswith(b'\xef\xbb\xbf')
    rows = list(csv.DictReader(io.StringIO(response.content.decode('utf-8-sig'))))
    assert len(rows) == 1
    assert list(rows[0]) == ['Reel / Platform', 'Views', 'Likes', 'Comments', 'Shares', 'Affiliate Link Clicks', 'Observed At (Asia/Bangkok)']
    assert rows[0]['Reel / Platform'].startswith("'=") and rows[0]['Comments'] == 'Unavailable'
    ranking = client.get('/api/tracking/export?format=csv&level=product&metric=views')
    ranking_rows = list(csv.DictReader(io.StringIO(ranking.content.decode('utf-8-sig'))))
    analysis = client.get('/api/tracking/analysis?level=product&metric=views').json()
    assert list(ranking_rows[0]) == ['Rank', 'Product', 'Views', 'Observed At (Asia/Bangkok)']
    assert ranking_rows == [{'Rank': str(index), 'Product': row['name'], 'Views': str(row['value']),
                            'Observed At (Asia/Bangkok)': row['observed_at'] or 'Unavailable'}
                            for index, row in enumerate(analysis['rows'], 1)]
    xlsx = client.get('/api/tracking/export?format=xlsx')
    with ZipFile(io.BytesIO(xlsx.content)) as archive:
        for name in archive.namelist():
            ElementTree.fromstring(archive.read(name))
        assert b'<f>' not in archive.read('xl/worksheets/sheet2.xml')
        detail = ElementTree.fromstring(archive.read('xl/worksheets/sheet2.xml'))
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        assert detail.find('s:sheetViews/s:sheetView/s:pane', ns).get('state') == 'frozen'
        assert detail.find('s:autoFilter', ns).get('ref') == 'A1:G2'
        assert all(cell.get('s') == '1' for cell in detail.findall('s:sheetData/s:row', ns)[0])
        assert 'Reel / Platform' in archive.read('xl/worksheets/sheet2.xml').decode()
        assert 'Account Sync Status' not in archive.read('xl/worksheets/sheet2.xml').decode()
        summary_xml = archive.read('xl/worksheets/sheet1.xml').decode()
        assert 'Sync Status' in summary_xml
        assert '"last_synced_at"' not in summary_xml
        workbook = ElementTree.fromstring(archive.read('xl/workbook.xml'))
        assert workbook.find('s:bookViews/s:workbookView', ns).get('activeTab') == '1'
        assert detail.find('s:sheetViews/s:sheetView', ns).get('tabSelected') == '1'
        styles = ElementTree.fromstring(archive.read('xl/styles.xml'))
        assert styles.find('s:fills/s:fill[3]/s:patternFill/s:fgColor', ns).get('rgb') == 'FF1F4E78'
        header_style = styles.findall('s:cellXfs/s:xf', ns)[1]
        assert header_style.find('s:alignment', ns).get('horizontal') == 'center'
        assert header_style.get('borderId') == '2'
        assert float(detail.find('s:sheetData/s:row', ns).get('ht')) == 48
    link = service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)
    response = client.get('/api/tracking/r/'+link.code, follow_redirects=False)
    assert response.status_code == 302 and response.headers['cache-control'] == 'no-store'
    assert response.headers['location'] == link.destination
    assert client.post('/api/tracking/metrics',json={}).status_code == 404

@pytest.mark.asyncio
async def test_partial_account_failure_rolls_back_and_continues(data):
    db, users, accounts, _ = data
    other = SocialAccount(account_id=uuid4(), user_id=users[0].user_id, platform_name='tiktok', access_token='encrypted')
    db.add(other); db.commit()
    async def sync(db, **kwargs):
        if kwargs['platform'] == 'youtube':
            service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                                  source_platform='youtube', external_ref='youtube:same', views=4)
            raise ValueError('invalid later page')
        return 2
    with patch.object(provider, '_sync_metrics', side_effect=sync), patch.object(provider.social_account_service, 'get_decrypted_access_token', return_value='token'):
        result = await provider.sync_member(db, user_id=users[0].user_id)
    assert result['social_metrics'] == 2 and sum(row['success'] for row in result['accounts']) == 1
    assert db.query(TrackingObservation).count() == 0 and accounts[0].last_synced_at is None

@pytest.mark.parametrize('b_start,b_end', [('2026-01-07', '2026-01-14'), ('2026-01-02', '2026-01-03'), ('2025-12-31', '2026-01-01')])
# F5-UTC08-TC03, F5-UTC08-TC04
def test_comparison_and_export_reject_overlapping_inclusive_periods(data, b_start, b_end):
    db, users, _, _ = data
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    params = dict(a_start='2026-01-01', a_end='2026-01-07', b_start=b_start, b_end=b_end)
    for endpoint in ('comparison', 'export'):
        response = client.get('/api/tracking/' + endpoint, params=params)
        assert response.status_code == 422
        assert 'Period B must start after Period A ends' in response.json()['detail']
    params.update(b_start='2026-01-08', b_end='2026-01-14')
    assert client.get('/api/tracking/comparison', params=params).status_code == 200
    params.update(b_start='2025-12-24', b_end='2025-12-31')
    for endpoint in ('comparison', 'export'):
        assert client.get('/api/tracking/' + endpoint, params=params).status_code == 422


@pytest.mark.parametrize('period', ['a', 'b'])
# F5-UTC08-TC05
def test_comparison_and_export_require_end_strictly_after_start(data, period):
    db, users, _, _ = data
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    params = dict(a_start='2026-01-01', a_end='2026-01-07', b_start='2026-01-08', b_end='2026-01-14')
    params[period + '_end'] = params[period + '_start']
    for endpoint in ('comparison', 'export'):
        assert client.get('/api/tracking/' + endpoint, params=params).status_code == 422


# F5-UTC08-TC06
def test_comparison_and_export_reject_future_dates_using_bangkok_today(data):
    db, users, _, _ = data
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: users[0]
    client = TestClient(app)
    params = dict(a_start='2026-01-01', a_end='2026-01-07', b_start='2026-01-08', b_end='2026-01-15')
    with patch('app.routes.tracking_routes.datetime') as clock:
        clock.now.side_effect = lambda tz: datetime(2026, 1, 14, 18, tzinfo=timezone.utc).astimezone(tz)
        assert client.get('/api/tracking/comparison', params=params).status_code == 200
        params['b_end'] = '2026-01-16'
        for endpoint in ('comparison', 'export'):
            response = client.get('/api/tracking/' + endpoint, params=params)
            assert response.status_code == 422
            assert 'Dates cannot be later than today' in response.json()['detail']


def test_filter_options_include_only_owned_published_distribution_relations(data):
    db, users, accounts, distributions = data
    reel = distributions[0].reel
    unpublished = Reel(reel_id=uuid4(), user_id=users[0].user_id,
                       product_id=reel.product_id, prompt_text='Not distributed')
    db.add(unpublished)
    db.add(Distribution(distribution_id=uuid4(), reel_id=unpublished.reel_id,
                        account_id=accounts[0].account_id, status='Pending'))
    db.commit()
    from app.routes.tracking_routes import trackingFilterOptions
    result = trackingFilterOptions(db=db, current_user=users[0])
    assert result['reels'] == [{'id': str(reel.reel_id), 'name': reel.name or reel.prompt_text}]
    assert len(result['distributions']) == 1
    relation = result['distributions'][0]
    assert relation['platform'] == 'youtube'
    assert relation['campaign_id'] == str(reel.product.campaign_id)
    assert relation['product_id'] == str(reel.product_id)
    assert relation['reel_id'] == str(reel.reel_id)
    assert result['products'] == [{'id': str(reel.product_id), 'name': reel.product.product_name}]


# F5-UTC06-TC06
def test_all_filtered_details_export_and_invalid_destinations(data):
    db, users, accounts, distributions = data
    original = distributions[0].reel
    for index in range(7):
        reel = Reel(reel_id=uuid4(), user_id=users[0].user_id, product_id=original.product_id, prompt_text=f'Reel {index}')
        distribution = Distribution(distribution_id=uuid4(), reel_id=reel.reel_id,
                                    account_id=accounts[0].account_id, platform_post_id=str(index), status='Published')
        db.add_all([reel, distribution]); db.commit()
        service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                              source_platform='youtube', external_ref=f'youtube:{index}', views=index)
        db.commit()
    report = service.dashboard(db, user_id=users[0].user_id, product_id=original.product_id)
    assert len(report['details']) == 7 and len(report['reels']) == 5
    assert report['totals']['views'] == 21
    from app.services.tracking_export_service import report_bytes
    content = report_bytes(report['details'], format='csv', filters={})
    assert len(list(csv.DictReader(io.StringIO(content.decode('utf-8-sig'))))) == 7
    assert service.detail_rows(db, user_id=users[1].user_id, product_id=original.product_id) == []
    original.product.affiliate_link = 'javascript:alert(1)'; db.commit()
    with pytest.raises(ValueError):
        service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=distributions[0].distribution_id)

# F5-UTC06-TC04
def test_observations_across_bangkok_midnight_do_not_overwrite_previous_day(data):
    db, users, accounts, _ = data
    for hour, views in ((16,10),(18,20)):
        service.record_metric(db, user_id=users[0].user_id, social_account_id=accounts[0].account_id,
                              source_platform='youtube', external_ref='youtube:same', views=views,
                              observed_at=datetime(2026,1,1,hour,tzinfo=timezone.utc))
        db.commit()
    assert db.query(TrackingObservation).count() == 2
    assert service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,1), end=date(2026,1,1))['totals']['views'] == 10
    assert service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,2), end=date(2026,1,2))['totals']['views'] == 20

# F5-UTC06-TC05
def test_daily_click_chart_separates_platforms_and_keeps_owner_and_date_filters(data):
    db, users, accounts, distributions = data
    facebook = SocialAccount(account_id=uuid4(), user_id=users[0].user_id, platform_name='facebook', access_token='encrypted')
    db.add(facebook); db.commit()
    distribution = Distribution(distribution_id=uuid4(), reel_id=distributions[0].reel_id,
                                account_id=facebook.account_id, status='Published', platform_post_id='video')
    db.add(distribution); db.commit()
    links = [service.ensure_tracking_link(db, user_id=users[0].user_id, distribution_id=item.distribution_id)
             for item in (distributions[0], distribution)]
    other = service.ensure_tracking_link(db, user_id=users[1].user_id, distribution_id=distributions[1].distribution_id)
    when = datetime(2026,1,1,17,tzinfo=timezone.utc)
    db.add_all([TrackingClick(link_id=links[0].link_id, clicked_at=when) for _ in range(2)])
    db.add(TrackingClick(link_id=links[1].link_id, clicked_at=when))
    db.add_all([TrackingClick(link_id=other.link_id, clicked_at=when) for _ in range(9)])
    db.commit()
    result = service.dashboard(db, user_id=users[0].user_id, start=date(2026,1,2), end=date(2026,1,2))
    assert result['click_trend'] == [{'date':'2026-01-02','clicks':3,'youtube':2,'facebook':1,'instagram':0,'tiktok':0}]
    assert result['totals']['clicks'] == 3
    scoped = service.dashboard(db, user_id=users[0].user_id, platform='facebook')
    assert scoped['click_trend'][0]['facebook'] == 1 and scoped['click_trend'][0]['youtube'] == 0
    assert scoped['totals']['clicks'] == 1
