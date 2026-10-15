"""Tracking report downloads; CSV UTF-8 BOM and XLSX inline-string cells."""
import csv
import io
import json
from datetime import datetime, timezone
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

from app.services.tracking_service import SEMANTICS


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
    records = [dict(row, **metadata) for row in rows]
    headers = list(records[0])
    if format == 'csv':
        stream = io.StringIO(newline='')
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows([[safe_text(row[key]) for key in headers] for row in records])
        return stream.getvalue().encode('utf-8-sig')
    summary = [['Field', 'Value'], *[[key, value] for key, value in metadata.items()]]
    if comparison:
        summary.extend([['Period A clicks', comparison['a']['clicks']],
                        ['Period B clicks', comparison['b']['clicks']],
                        ['Difference', comparison['difference']],
                        ['Percentage change', comparison['percentage_change']]])
    detail = [headers, *[[row[key] for key in headers] for row in records]]
    output = io.BytesIO()
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in (1, 2)) + '</Types>')
        archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Details" sheetId="2" r:id="rId2"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in (1, 2)) + '</Relationships>')
        for index, sheet in enumerate((summary, detail), 1):
            parts = ['<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
            for row in sheet:
                parts.append('<row>')
                for value in row:
                    if isinstance(value, (int, float)) and not isinstance(value, bool):
                        parts.append(f'<c><v>{value}</v></c>')
                    else:
                        parts.append('<c t="inlineStr"><is><t xml:space="preserve">' + escape(str(safe_text(value))) + '</t></is></c>')
                parts.append('</row>')
            parts.append('</sheetData></worksheet>')
            archive.writestr(f'xl/worksheets/sheet{index}.xml', ''.join(parts))
    return output.getvalue()
