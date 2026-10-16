"""Tracking report downloads; CSV UTF-8 BOM and XLSX inline-string cells."""
import csv
import io
import json
import math
from datetime import datetime, timezone
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

from app.services.tracking_service import REPORT_TZ, SEMANTICS


def column_name(index):
    name = ''
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def header_title(key):
    return {'Reel / platform': 'Reel / Platform', 'Link clicks': 'Affiliate Link Clicks',
            'Observation': 'Observed At (Asia/Bangkok)', 'observed_at': 'Observed At (Asia/Bangkok)',
            'clicks': 'Affiliate Link Clicks', 'semantics': 'Metric Definitions',
            'exported_at': 'Exported At (UTC)', 'sync_freshness': 'Account Sync Status',
            'comparison_period': 'Comparison Period', 'period_start': 'Period Start',
            'period_end': 'Period End'}.get(key, key.replace('_', ' ').title().replace(' Id', ' ID'))


def report_time(value):
    if not value:
        return 'Not yet synchronized'
    return datetime.fromisoformat(value).astimezone(REPORT_TZ).strftime('%d %b %Y, %H:%M:%S')


def safe_text(value):
    if value is None:
        return 'Unavailable'
    if not isinstance(value, str):
        return value
    value = ''.join(c for c in value if ord(c) >= 32 or c in '\t\n\r')
    if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n')):
        return "'" + value
    return value


def report_bytes(rows, *, format, filters, comparison=None, accounts=None):
    metadata = {'semantics': SEMANTICS, 'filters': json.dumps(filters, default=str, ensure_ascii=False),
                'exported_at': datetime.now(timezone.utc).isoformat(),
                'sync_freshness': json.dumps(accounts or [], ensure_ascii=False),
                'comparison': json.dumps(comparison, ensure_ascii=False) if comparison else ''}
    if comparison:
        # Keep readable content and period labels without internal IDs or raw metadata.
        columns = ('reel_name', 'product_name', 'campaign_name', 'platform',
                   'distribute_date', 'views', 'likes', 'comments', 'shares',
                   'engagement', 'clicks', 'comparison_period',
                   'period_start', 'period_end', 'observed_at')
        records = [{key: row.get(key) for key in columns} for row in rows]
    elif filters.get('level'):
        metric = filters.get('metric', 'views')
        metric_title = {'views': 'Views', 'likes': 'Likes', 'comments': 'Comments',
                        'shares': 'Shares', 'engagement': 'Engagement', 'clicks': 'Affiliate link clicks'}[metric]
        records = [{'Rank': index, filters['level'].title(): row['name'] or 'Untitled',
                    metric_title: row['value'], 'observed_at': row['observed_at']}
                   for index, row in enumerate(rows, 1)]
    else:
        records = [{'Reel / platform': f"{row['reel_name']} · {row['platform']}",
                    'Views': row['views'], 'Likes': row['likes'], 'Comments': row['comments'],
                    'Shares': row['shares'], 'Link clicks': row['clicks'],
                    'Observation': row['observed_at']} for row in rows]
    headers = list(records[0])
    if format == 'csv':
        stream = io.StringIO(newline='')
        writer = csv.writer(stream)
        writer.writerow([header_title(key) for key in headers])
        writer.writerows([[safe_text(row[key]) for key in headers] for row in records])
        return stream.getvalue().encode('utf-8-sig')
    summary = [['Report Information', 'Value'],
               ['Report Type', 'Period Comparison' if comparison else 'Content Ranking' if filters.get('level') else 'Tracking Details'],
               ['Exported At (Asia/Bangkok)', report_time(metadata['exported_at'])],
               ['Timezone', 'Asia/Bangkok'], ['Exported Rows', len(rows)]]
    for key, value in filters.items():
        if value is not None and value != '':
            # Use the content name when it is available in the exported scope.
            name_key = key.replace('_id', '_name')
            label = next((row.get(name_key) for row in rows if str(row.get(key)) == str(value) and row.get(name_key)), None)
            summary.append([header_title(key), label or str(value)])
    if not filters.get('start') and not filters.get('end'):
        summary.append(['Date Range', 'All dates'])
    summary.append(['Metric Definitions', SEMANTICS])
    if accounts:
        for account in accounts:
            summary.append([f"{account['platform'].title()} · Last Sync (Asia/Bangkok)", report_time(account.get('last_synced_at'))])
            summary.append([f"{account['platform'].title()} · Sync Status", account.get('error') or ('Synchronized' if account.get('last_synced_at') else 'Awaiting first sync')])
    else:
        summary.append(['Account Sync Status', 'No connected accounts'])
    if comparison:
        summary.extend([['Period A clicks', comparison['a']['clicks']],
                        ['Period B clicks', comparison['b']['clicks']],
                        ['Difference', comparison['difference']],
                        ['Percentage change', comparison['percentage_change']]])
    detail = [[header_title(key) for key in headers], *[[row[key] for key in headers] for row in records]]
    output = io.BytesIO()
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in (1, 2)) + '</Types>')
        archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="1"/></bookViews><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Details" sheetId="2" r:id="rId2"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in (1, 2)) + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml', '''<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Arial"/><color rgb="FF172B4D"/></font><font><b/><sz val="11"/><name val="Arial"/><color rgb="FFFFFFFF"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9DEE5"/></left><right style="thin"><color rgb="FFD9DEE5"/></right><top style="thin"><color rgb="FFD9DEE5"/></top><bottom style="thin"><color rgb="FFD9DEE5"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FFFFFFFF"/></left><right style="thin"><color rgb="FFFFFFFF"/></right><top style="thin"><color rgb="FFFFFFFF"/></top><bottom style="thin"><color rgb="FFFFFFFF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyBorder="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>''')
        for index, sheet in enumerate((summary, detail), 1):
            parts = [f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" tabSelected="{1 if index == 2 else 0}"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>']
            widths = []
            for col, title in enumerate(sheet[0], 1):
                width = (32 if col == 1 else 100) if index == 1 else (55 if title in {'Reel / Platform', 'Reel', 'Product', 'Campaign'} else max(16, min(36, len(title) + 4)))
                widths.append(width)
                parts.append(f'<col min="{col}" max="{col}" width="{width}" customWidth="1"/>')
            parts.append('</cols><sheetData>')
            for row_index, row in enumerate(sheet, 1):
                # Excel does not reliably auto-fit wrapped cells generated outside Excel.
                lines = max(sum(max(1, math.ceil(len(line) / (width * 0.85)))
                                for line in str(safe_text(value)).split('\n'))
                            for value, width in zip(row, widths))
                height = 48 if row_index == 1 else min(409, max(28, lines * 15 + 8))
                parts.append(f'<row r="{row_index}" ht="{height}" customHeight="1">')
                for col, value in enumerate(row, 1):
                    ref = f'{column_name(col)}{row_index}'
                    if isinstance(value, (int, float)) and not isinstance(value, bool):
                        parts.append(f'<c r="{ref}" s="{1 if row_index == 1 else 2}"><v>{value}</v></c>')
                    else:
                        parts.append(f'<c r="{ref}" s="{1 if row_index == 1 else 0}" t="inlineStr"><is><t xml:space="preserve">' + escape(str(safe_text(value))) + '</t></is></c>')
                parts.append('</row>')
            parts.append('</sheetData>')
            if index == 2:
                parts.append(f'<autoFilter ref="A1:{column_name(len(sheet[0]))}{len(sheet)}"/>')
            parts.append('</worksheet>')
            archive.writestr(f'xl/worksheets/sheet{index}.xml', ''.join(parts))
    return output.getvalue()
