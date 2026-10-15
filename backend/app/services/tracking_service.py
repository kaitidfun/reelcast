"""F5 social lifetime observations and timestamped affiliate-link visits.

Dates select observations for social counters, and activity for link clicks.
Lifetime counters must never be summed across observation days.
"""
from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.models import (Campaign, Distribution, Product, Reel, SocialAccount,
                               TrackingClick, TrackingLink, TrackingObservation)

SUPPORTED_TRACKING_PLATFORMS = frozenset({'youtube', 'facebook', 'instagram', 'tiktok'})
ANALYSIS_LEVELS = frozenset({'reel', 'product', 'campaign', 'platform'})
ANALYSIS_METRICS = frozenset({'views', 'engagement', 'clicks'})
SOCIAL_METRICS = ('views', 'likes', 'comments', 'shares', 'engagement')
REPORT_TZ = ZoneInfo('Asia/Bangkok')
SEMANTICS = ('Social: latest lifetime observation within selected dates; dates are observation dates, '
             'not publication or activity dates. Clicks: recorded visits during selected dates. '
             'Timezone: Asia/Bangkok. Repeated human GET visits count; recognized bots and HEAD do not. '
             'Engagement: YouTube likes + comments; TikTok/Instagram likes + comments + shares; '
             'Facebook videos likes + comments; Facebook Page posts reactions + comments + shares. '
             'Unavailable components are not treated as zero. No unique-visitor or purchase attribution.')


def record_metric(db: Session, *, user_id: UUID, social_account_id: UUID,
                  source_platform: str, external_ref: str, record_date: date | None = None,
                  observed_at: datetime | None = None, **metrics):
    account = db.query(SocialAccount).filter(
        SocialAccount.account_id == social_account_id, SocialAccount.user_id == user_id,
        SocialAccount.platform_name == source_platform).first()
    if not account or source_platform not in SUPPORTED_TRACKING_PLATFORMS:
        raise LookupError('Social account not found')
    if not external_ref:
        raise ValueError('A stable provider post reference is required')
    # Resolve associations exclusively from owned published distributions. Adapter UUIDs
    # are not authority to attach an unrelated post to a Reel or product.
    post_id = external_ref.removeprefix(source_platform + ':')
    distribution = db.query(Distribution).join(Reel).filter(
        Distribution.account_id == social_account_id, Reel.user_id == user_id,
        Distribution.platform_post_id == post_id, Distribution.status == 'Published').first()
    now = observed_at or datetime.now(timezone.utc)
    values = dict(user_id=user_id, account_id=social_account_id, platform=source_platform,
                  external_ref=external_ref, observed_date=now.astimezone(REPORT_TZ).date(), observed_at=now,
                  published_date=record_date,
                  distribution_id=distribution.distribution_id if distribution else None)
    for name in SOCIAL_METRICS:
        value = metrics.get(name)
        if value is not None and (isinstance(value, bool) or int(value) < 0):
            raise ValueError('Metric counters must be nonnegative')
        values[name] = int(value) if value is not None else None
    statement = insert(TrackingObservation).values(**values)
    statement = statement.on_conflict_do_update(
        index_elements=['user_id', 'account_id', 'external_ref', 'observed_date'],
        set_={key: value for key, value in values.items()
              if key not in {'user_id', 'account_id', 'external_ref', 'observed_date'}},
        where=TrackingObservation.observed_at <= now)
    db.execute(statement)
    # Caller owns the transaction so a malformed page cannot leave a half-sync.


def _bounds(start=None, end=None):
    lower = datetime.combine(start, time.min, REPORT_TZ).astimezone(timezone.utc) if start else None
    upper = datetime.combine(end + timedelta(days=1), time.min, REPORT_TZ).astimezone(timezone.utc) if end else None
    return lower, upper


def _scope_query(db, model, user_id):
    return (db.query(model, Distribution, Reel, Product, Campaign, SocialAccount)
            .join(Distribution, model.distribution_id == Distribution.distribution_id)
            .join(Reel, Distribution.reel_id == Reel.reel_id)
            .outerjoin(Product, Reel.product_id == Product.product_id)
            .outerjoin(Campaign, Product.campaign_id == Campaign.campaign_id)
            .join(SocialAccount, Distribution.account_id == SocialAccount.account_id)
            .filter(model.user_id == user_id, Reel.user_id == user_id,
                    SocialAccount.user_id == user_id,
                    Reel.deleted_at.is_(None)))


def _filters(query, platform=None, campaign_id=None, product_id=None, reel_id=None):
    if platform:
        query = query.filter(SocialAccount.platform_name == platform)
    if campaign_id:
        query = query.filter(Campaign.campaign_id == campaign_id, Campaign.deleted_at.is_(None))
    if product_id:
        query = query.filter(Product.product_id == product_id, Product.deleted_at.is_(None))
    if reel_id:
        query = query.filter(Reel.reel_id == reel_id)
    return query


def _identity(distribution, reel, product, campaign, account):
    return dict(distribution_id=str(distribution.distribution_id), reel_id=str(reel.reel_id),
                reel_name=reel.prompt_text or 'Untitled Reel',
                product_id=str(product.product_id) if product else None,
                product_name=product.product_name if product else None,
                campaign_id=str(campaign.campaign_id) if campaign else None,
                campaign_name=campaign.name if campaign else None, platform=account.platform_name)


def detail_rows(db: Session, *, user_id, start=None, end=None, **filters):
    lower, upper = _bounds(start, end)
    query = _filters(_scope_query(db, TrackingObservation, user_id), **filters)
    if lower:
        query = query.filter(TrackingObservation.observed_at >= lower)
    if upper:
        query = query.filter(TrackingObservation.observed_at < upper)
    latest = {}
    for observation, distribution, reel, product, campaign, account in query.order_by(TrackingObservation.observed_at).all():
        key = str(distribution.distribution_id)
        latest[key] = dict(_identity(distribution, reel, product, campaign, account),
                           **{metric: getattr(observation, metric) for metric in SOCIAL_METRICS},
                           clicks=0, observed_at=observation.observed_at.isoformat())
    links = _filters(_scope_query(db, TrackingLink, user_id), **filters)
    for link, distribution, reel, product, campaign, account in links.all():
        key = str(distribution.distribution_id)
        row = latest.setdefault(key, dict(_identity(distribution, reel, product, campaign, account),
                                         **dict.fromkeys(SOCIAL_METRICS), clicks=0, observed_at=None))
        clicks = db.query(TrackingClick).filter(TrackingClick.link_id == link.link_id)
        if lower:
            clicks = clicks.filter(TrackingClick.clicked_at >= lower)
        if upper:
            clicks = clicks.filter(TrackingClick.clicked_at < upper)
        row['clicks'] = clicks.count()
    return list(latest.values())


def _totals(rows):
    totals = {'clicks': sum(row['clicks'] for row in rows)}
    for metric in SOCIAL_METRICS:
        values = [row[metric] for row in rows if row[metric] is not None]
        totals[metric] = sum(values) if values else None
    totals['partial_metrics'] = [metric for metric in SOCIAL_METRICS
                                 if any(row[metric] is None for row in rows)]
    return totals


def _rank(rows, level, metric):
    groups = defaultdict(list)
    for row in rows:
        key = row['platform'] if level == 'platform' else row[level + '_id']
        if key:
            groups[key].append(row)
    result = []
    for key, items in groups.items():
        totals = _totals(items)
        result.append(dict(id=key, name=key if level == 'platform' else items[0][level + '_name'],
                           **totals, value=totals[metric]))
    return sorted(result, key=lambda row: (row['value'] is not None, row['value'] or 0), reverse=True)


def dashboard(db: Session, *, user_id, start=None, end=None, **filters):
    rows = detail_rows(db, user_id=user_id, start=start, end=end, **filters)
    accounts = db.query(SocialAccount).filter(SocialAccount.user_id == user_id).all()
    unrelated = db.query(TrackingObservation).filter(
        TrackingObservation.user_id == user_id, TrackingObservation.distribution_id.is_(None)).count()
    link_ids = _filters(_scope_query(db, TrackingLink, user_id), **filters).with_entities(TrackingLink.link_id)
    clicks = db.query(TrackingClick.clicked_at).filter(TrackingClick.link_id.in_(link_ids.statement))
    lower, upper = _bounds(start, end)
    if lower:
        clicks = clicks.filter(TrackingClick.clicked_at >= lower)
    if upper:
        clicks = clicks.filter(TrackingClick.clicked_at < upper)
    daily = defaultdict(int)
    for (timestamp,) in clicks.all():
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        daily[timestamp.astimezone(REPORT_TZ).date().isoformat()] += 1
    return dict(totals=dict(_totals(rows), reels=len({row['reel_id'] for row in rows})),
                click_trend=[dict(date=day, clicks=count) for day, count in sorted(daily.items())],
                platforms=_rank(rows, 'platform', 'views'),
                products=_rank(rows, 'product', 'views')[:5],
                campaigns=_rank(rows, 'campaign', 'views')[:5], reels=_rank(rows, 'reel', 'views')[:5],
                details=rows, has_data=bool(rows), semantics=SEMANTICS,
                unrelated_observations=unrelated,
                accounts=[dict(id=str(a.account_id), platform=a.platform_name,
                               last_synced_at=a.last_synced_at.isoformat() if a.last_synced_at else None,
                               error=a.sync_error) for a in accounts],
                generated_at=datetime.now(timezone.utc).isoformat())


def analyze_performance(db: Session, *, user_id, level, metric, **filters):
    rows = detail_rows(db, user_id=user_id, **filters)
    return dict(level=level, metric=metric, rows=_rank(rows, level, metric), semantics=SEMANTICS)


def compare_periods(db: Session, *, user_id, a_start, a_end, b_start, b_end, **filters):
    a = detail_rows(db, user_id=user_id, start=a_start, end=a_end, **filters)
    b = detail_rows(db, user_id=user_id, start=b_start, end=b_end, **filters)
    av, bv = sum(row['clicks'] for row in a), sum(row['clicks'] for row in b)
    earliest = _filters(_scope_query(db, TrackingLink, user_id), **filters).with_entities(TrackingLink.created_at).all()
    # Zero before collection began is unknown, not a measured zero. With several
    # links, coverage starts when the last link in the scope was created.
    coverage = max((row[0] for row in earliest), default=None)
    if coverage and coverage.tzinfo is None:
        coverage = coverage.replace(tzinfo=timezone.utc)
    complete_a = bool(coverage and coverage <= _bounds(a_start)[0] and a_end < datetime.now(REPORT_TZ).date())
    complete_b = bool(coverage and coverage <= _bounds(b_start)[0] and b_end < datetime.now(REPORT_TZ).date())
    comparable = complete_a and complete_b
    return dict(a=dict(start=a_start.isoformat(), end=a_end.isoformat(), clicks=av, complete=complete_a),
                b=dict(start=b_start.isoformat(), end=b_end.isoformat(), clicks=bv, complete=complete_b),
                difference=bv-av if comparable else None,
                percentage_change=round((bv-av)/av*100, 2) if comparable and av else None,
                equal_duration=(a_end-a_start) == (b_end-b_start),
                coverage_start=coverage.isoformat() if coverage else None,
                social_comparison=None,
                limitation='Social providers currently supply lifetime counters; daily social activity is unavailable. '
                           'Click differences require completed periods fully covered by link collection.',
                semantics=SEMANTICS)


def ensure_tracking_link(db: Session, *, user_id, distribution_id):
    distribution = db.query(Distribution).join(Reel).join(SocialAccount, Distribution.account_id == SocialAccount.account_id).filter(
        Distribution.distribution_id == distribution_id, Reel.user_id == user_id,
        SocialAccount.user_id == user_id, Reel.deleted_at.is_(None)).first()
    if not distribution:
        raise LookupError('Distribution not found')
    existing = db.query(TrackingLink).filter(TrackingLink.distribution_id == distribution_id,
                                           TrackingLink.user_id == user_id).first()
    if existing:
        return existing
    destination = (distribution.reel.product.affiliate_link or '').strip() if distribution.reel.product else ''
    parsed = urlsplit(destination)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password or any(ord(c) < 32 for c in destination):
        raise ValueError('Product must have a valid HTTP(S) affiliate destination')
    stmt = insert(TrackingLink).values(user_id=user_id, distribution_id=distribution_id,
                                      code=secrets.token_urlsafe(18), destination=destination,
                                      created_at=datetime.now(timezone.utc))
    db.execute(stmt.on_conflict_do_nothing(index_elements=['distribution_id']))
    db.commit()
    return db.query(TrackingLink).filter(TrackingLink.distribution_id == distribution_id,
                                       TrackingLink.user_id == user_id).one()


def follow_link(db: Session, *, code, method='GET', user_agent='', purpose=''):
    link = db.query(TrackingLink).filter(TrackingLink.code == code).first()
    if not link:
        raise LookupError('Tracking link not found')
    bot = any(word in user_agent.lower() for word in ('bot', 'crawler', 'spider', 'slurp', 'preview', 'facebookexternalhit'))
    if method == 'GET' and not bot and 'prefetch' not in purpose.lower():
        db.add(TrackingClick(link_id=link.link_id, clicked_at=datetime.now(timezone.utc)))
        db.commit()
    return link.destination
