"""Feature 5: social sync, link visits, dashboard, ranking, comparison, export."""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import BACKEND_URL
from app.dependencies import get_current_user, get_db
from app.models.models import Campaign, Distribution, Product, Reel, SocialAccount, User
from app.services import tracking_provider_service, tracking_service as service
from app.services.tracking_export_service import report_bytes

router = APIRouter(prefix='/api/tracking', tags=['Data Tracking'])


def tracking_filters(start: date | None = None, end: date | None = None,
                     platform: str | None = None, campaign_id: UUID | None = None,
                     product_id: UUID | None = None, reel_id: UUID | None = None,
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if start and end and start > end:
        raise HTTPException(422, 'Start date must be before end date')
    if platform and platform not in service.SUPPORTED_TRACKING_PLATFORMS:
        raise HTTPException(422, 'Unsupported tracking platform')
    for model, ident, column in ((Campaign, campaign_id, Campaign.campaign_id),
                                 (Product, product_id, Product.product_id), (Reel, reel_id, Reel.reel_id)):
        if ident and not db.query(model).filter(column == ident, model.user_id == user.user_id,
                                               model.deleted_at.is_(None)).first():
            raise HTTPException(404, 'Tracking scope not found')
    return dict(start=start, end=end, platform=platform, campaign_id=campaign_id,
                product_id=product_id, reel_id=reel_id)


@router.post('/sync')
async def synchronizeTrackingData(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await tracking_provider_service.sync_member(db, user_id=current_user.user_id)


@router.get('/readiness')
def tracking_readiness(current_user: User = Depends(get_current_user)):
    return {'providers': tracking_provider_service.readiness(), 'configuration_only': True}


@router.get('/dashboard')
def getTrackingDashboard(filters: dict = Depends(tracking_filters), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.dashboard(db, user_id=current_user.user_id, **filters)


@router.get('/analysis')
def analyzeTrackingPerformance(level: str, metric: str, filters: dict = Depends(tracking_filters),
                               db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if level not in service.ANALYSIS_LEVELS or metric not in service.ANALYSIS_METRICS:
        raise HTTPException(422, 'Unsupported analysis level or metric')
    return service.analyze_performance(db, user_id=current_user.user_id, level=level, metric=metric, **filters)


def _comparison(db, user_id, filters, a_start, a_end, b_start, b_end):
    if not all((a_start, a_end, b_start, b_end)) or a_start > a_end or b_start > b_end:
        raise HTTPException(422, 'Supply two valid complete date ranges')
    scope = {key: value for key, value in filters.items() if key not in {'start', 'end'}}
    return service.compare_periods(db, user_id=user_id, a_start=a_start, a_end=a_end,
                                   b_start=b_start, b_end=b_end, **scope)


@router.get('/comparison')
def compareTrackingPeriods(a_start: date, a_end: date, b_start: date, b_end: date,
                          filters: dict = Depends(tracking_filters), db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    return _comparison(db, current_user.user_id, filters, a_start, a_end, b_start, b_end)


@router.get('/export')
def exportTrackingData(format: str = Query('csv', pattern='^(csv|xlsx)$'),
                       level: str | None = None, metric: str = 'views',
                       a_start: date | None = None, a_end: date | None = None,
                       b_start: date | None = None, b_end: date | None = None,
                       filters: dict = Depends(tracking_filters), db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    comparison = None
    dashboard = service.dashboard(db, user_id=current_user.user_id, **filters)
    rows = dashboard['details']
    if any((a_start, a_end, b_start, b_end)):
        comparison = _comparison(db, current_user.user_id, filters, a_start, a_end, b_start, b_end)
        scope = {key: value for key, value in filters.items() if key not in {'start', 'end'}}
        rows = []
        for label, start, end in (('A', a_start, a_end), ('B', b_start, b_end)):
            rows.extend(dict(row, comparison_period=label, period_start=start.isoformat(), period_end=end.isoformat())
                        for row in service.detail_rows(db, user_id=current_user.user_id, start=start, end=end, **scope))
    elif level:
        if level not in service.ANALYSIS_LEVELS or metric not in service.ANALYSIS_METRICS:
            raise HTTPException(422, 'Unsupported analysis level or metric')
        rows = service.analyze_performance(db, user_id=current_user.user_id, level=level, metric=metric, **filters)['rows']
    if not rows:
        raise HTTPException(404, 'No tracking data matches these filters')
    content = report_bytes(rows, format=format, filters=dict(filters, level=level, metric=metric),
                           comparison=comparison, accounts=dashboard['accounts'])
    media = 'text/csv; charset=utf-8' if format == 'csv' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return Response(content, media_type=media, headers={'Content-Disposition': f'attachment; filename="reelcast-tracking.{format}"'})


@router.post('/links/{distribution_id}')
def createTrackingLink(distribution_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        link = service.ensure_tracking_link(db, user_id=current_user.user_id, distribution_id=distribution_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {'url': f'{BACKEND_URL.rstrip("/")}/api/tracking/r/{link.code}', 'distribution_id': str(distribution_id)}


@router.api_route('/r/{code}', methods=['GET', 'HEAD'])
def redirectTrackingLink(code: str, request: Request, db: Session = Depends(get_db)):
    try:
        destination = service.follow_link(db, code=code, method=request.method,
                                          user_agent=request.headers.get('user-agent', ''),
                                          purpose=request.headers.get('sec-purpose', request.headers.get('purpose', '')))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return RedirectResponse(destination, status_code=302, headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})


@router.get('/filter-options')
def trackingFilterOptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    def owned(model, id_column, name_column):
        return [{'id': str(getattr(row, id_column)), 'name': getattr(row, name_column)}
                for row in db.query(model).filter(model.user_id == current_user.user_id, model.deleted_at.is_(None)).all()]
    return dict(platforms=sorted(service.SUPPORTED_TRACKING_PLATFORMS),
                campaigns=owned(Campaign, 'campaign_id', 'name'),
                products=owned(Product, 'product_id', 'product_name'), reels=owned(Reel, 'reel_id', 'prompt_text'),
                distributions=[dict(id=str(distribution.distribution_id), name=f'{reel.name or reel.prompt_text} · {account.platform_name}')
                               for distribution, reel, account in db.query(Distribution, Reel, SocialAccount)
                               .join(Reel, Distribution.reel_id == Reel.reel_id)
                               .join(SocialAccount, Distribution.account_id == SocialAccount.account_id)
                               .filter(Reel.user_id == current_user.user_id, SocialAccount.user_id == current_user.user_id,
                                       Reel.deleted_at.is_(None)).all()])
