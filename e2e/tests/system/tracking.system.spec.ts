import { readFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import type { Page } from '@playwright/test';
import { test, expect, backend, destination } from '../../helpers/tracking-fixture';
import { query } from '../../helpers/db-helper';

async function periods(page: Page, aEnd = '2026-10-18', bStart = '2026-10-19', bEnd = '2026-10-25') {
  for (const [label, value] of [['Start date', '2026-10-12'], ['End date', aEnd],
    ['Period B start date', bStart], ['Period B end date', bEnd]]) await page.getByLabel(label, { exact: true }).fill(value);
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

function workbook(file: string) {
  const python = process.env.TRACKING_TEST_PYTHON ?? path.resolve('../backend/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return JSON.parse(execFileSync(python, ['-c', `
import json,sys,zipfile,xml.etree.ElementTree as E
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 w=E.fromstring(z.read('xl/workbook.xml'))
 d=E.fromstring(z.read('xl/worksheets/sheet2.xml'))
 print(json.dumps(dict(sheets=[s.get('name') for s in w.findall('s:sheets/s:sheet',ns)],
  frozen=d.find('s:sheetViews/s:sheetView/s:pane',ns).get('state'),
  filter=d.find('s:autoFilter',ns).get('ref'), formulas=len(d.findall('.//s:f',ns)),
  text=' '.join(t.text or '' for t in d.findall('.//s:t',ns)))))
`, file], { encoding: 'utf8' }));
}

// UTC: F5-UTC04, F5-UTC05. STC: STC-F5-01-TC-06..TC-09.
test('STC-F5-01-TC-06..09 public links redirect and count qualifying repeat visits', async ({ tracking, request }) => {
  const [id] = await tracking.seed([10], 0, 0);
  const link = await request.post(`${backend}/api/tracking/links/${id}`, { headers: headers(tracking.token) });
  expect(link.ok()).toBeTruthy();
  const result = await link.json();
  // BACKEND_URL may be the public deployment URL; target this test backend.
  const url = backend + new URL(result.url).pathname;
  const count = async () => {
    const result = await request.get(`${backend}/api/tracking/dashboard`, { headers: headers(tracking.token) });
    return (await result.json()).totals.clicks;
  };
  for (const expected of [1, 2]) {
    const response = await request.get(url, { maxRedirects: 0, headers: { 'User-Agent': 'Browser' } });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe(destination);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(await count()).toBe(expected);
  }
  for (const [method, extra] of [['HEAD', {}], ['GET', { 'User-Agent': 'Googlebot' }], ['GET', { 'Sec-Purpose': 'prefetch' }]] as const) {
    const response = await request.fetch(url, { method, headers: extra, maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(await count()).toBe(2);
  }
  const missing = await request.get(`${backend}/api/tracking/r/unknown-code`);
  expect(missing.status()).toBe(404);
  expect((await missing.json()).detail).toBe('Tracking link not found');
  expect(await count()).toBe(2);
});

// UTC: F5-UTC06. STC: STC-F5-02-TC-01, TC-02.
test('STC-F5-02-TC-01..02 latest values and unavailable comments appear on screen', async ({ tracking, page }) => {
  await tracking.seed([10], 3, 0);
  // The second same-day observation replaces the first, as the sync upsert does.
  await query('UPDATE tracking_observations SET views=12,observed_at=$2 WHERE user_id=$1', [tracking.owner, '2026-10-20T11:00:00Z']);
  await page.goto('/tracking');
  await expect(page.locator('section').filter({ has: page.locator('p').filter({ hasText: /^Views$/ }) })).toContainText('12');
  await expect(page.getByRole('region', { name: 'Tracking details table', exact: true })).toContainText('Unavailable');
  const cells = page.getByRole('region', { name: 'Tracking details table', exact: true }).locator('tbody tr').first().locator('td');
  await expect(cells.nth(3)).toHaveText('12');
  await expect(cells.nth(5)).toHaveText('Unavailable');
  await expect(cells.nth(7)).toHaveText('3');
});

// UTC: F5-UTC06-TC06. STC: STC-F5-02-TC-03.
test('STC-F5-02-TC-03 top lists retain five items while details retain seven', async ({ tracking, page, request }) => {
  await tracking.seed([0, 1, 2, 3, 4, 5, 6]);
  const response = await request.get(`${backend}/api/tracking/dashboard`, { headers: headers(tracking.token) });
  const report = await response.json();
  expect(report.totals.views).toBe(21);
  for (const key of ['reels', 'products', 'campaigns']) expect(report[key].length).toBeLessThanOrEqual(5);
  expect(report.details).toHaveLength(7);
  await page.goto('/tracking');
  await expect(page.getByRole('region', { name: 'Tracking details table', exact: true }).locator('tbody tr')).toHaveCount(7);
  await expect(page.getByText('Showing 1–7 of 7 · 25 rows per page')).toBeVisible();
});

// UTC: F5-UTC06-TC10. STC: STC-F5-02-TC-04.
test('STC-F5-02-TC-04 connected member without data can sync', async ({ tracking, page }) => {
  await page.goto('/tracking');
  await expect(page.getByRole('heading', { name: 'Ready to see how your content performs?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync Data', exact: true })).toBeEnabled();
});

// UTC: F5-UTC06-TC03. STC: STC-F5-02-TC-05.
test('STC-F5-02-TC-05 another authenticated member cannot read this scope', async ({ tracking, page, request, browser }) => {
  await tracking.seed([12]);
  const { registerAndLogin, systemUser, authToken } = await import('../../helpers/system-fixture');
  const { deleteUserByEmail, findUserByEmail } = await import('../../helpers/db-helper');
  const other = systemUser(test.info(), 'stc-f5-other');
  const context = await browser.newContext();
  try {
    const otherPage = await context.newPage();
    await registerAndLogin(otherPage, request, other);
    const token = await authToken(otherPage);
    const owner = (await findUserByEmail(other.email))!.user_id;
    const account = randomUUID(), reel = randomUUID(), distribution = randomUUID();
    await query("INSERT INTO social_accounts(account_id,user_id,platform_name,access_token) VALUES($1,$2,'youtube','reporting-fixture-only')", [account, owner]);
    await query("INSERT INTO reels(reel_id,user_id,prompt_text,status) VALUES($1,$2,'Other member Reel','Completed')", [reel, owner]);
    await query("INSERT INTO distributions(distribution_id,reel_id,account_id,status,platform_post_id) VALUES($1,$2,$3,'Published','other')", [distribution, reel, account]);
    await query(`INSERT INTO tracking_observations(observation_id,user_id,account_id,distribution_id,platform,external_ref,observed_date,observed_at,views)
      VALUES($1,$2,$3,$4,'youtube','youtube:other','2026-10-20','2026-10-20T10:00:00Z',99)`, [randomUUID(), owner, account, distribution]);
    const response = await request.get(`${backend}/api/tracking/dashboard`, { headers: headers(token) });
    expect((await response.json()).totals.views).toBe(99);
    await otherPage.goto('/tracking');
    await expect(otherPage.getByRole('region', { name: 'Tracking details table', exact: true })).toContainText('99');
    await expect(otherPage.getByRole('region', { name: 'Tracking details table', exact: true }).locator('tbody tr')).toHaveCount(1);
    await page.goto('/tracking');
    const ownDetails = page.getByRole('region', { name: 'Tracking details table', exact: true });
    await expect(ownDetails).toContainText('12');
    await expect(ownDetails).not.toContainText('Other member Reel');
    await expect(ownDetails.locator('tbody tr')).toHaveCount(1);
  } finally { await context.close(); await deleteUserByEmail(other.email); }
});

// UTC: F5-UTC07-TC01..05. STC: STC-F5-03-TC-01, TC-02, TC-03.
test('STC-F5-03-TC-01..03 ranking preserves zero, unavailable and empty results', async ({ tracking, page }) => {
  await tracking.seed([20], 0, 0);
  await query('UPDATE tracking_observations SET comments=0 WHERE user_id=$1', [tracking.owner]);
  await page.goto('/tracking');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Content ranking', exact: true }) });
  for (const [metric, expected] of [['Views', '20'], ['Comments', '0'], ['Shares', 'Unavailable']]) {
    await page.getByRole('combobox', { name: 'Ranking metric' }).click();
    await page.getByRole('option', { name: metric, exact: true }).click();
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(section.getByRole('button', { name: /#1/ })).toContainText(expected);
  }
  // STC-F5-03-TC-02 also requires unavailable rows after available values.
  const [additional] = await tracking.seed([5], 0, 0);
  await query('UPDATE tracking_observations SET shares=2 WHERE distribution_id=$1', [additional]);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(section.getByRole('button', { name: /#1/ })).toContainText('2');
  await expect(section.getByRole('button', { name: /#2/ })).toContainText('Unavailable');
  await query('DELETE FROM tracking_clicks WHERE link_id IN (SELECT link_id FROM tracking_links WHERE user_id=$1)', [tracking.owner]);
  await query('DELETE FROM tracking_links WHERE user_id=$1', [tracking.owner]);
  await query('DELETE FROM tracking_observations WHERE user_id=$1', [tracking.owner]);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByText('No matching content.')).toBeVisible();
});

// UTC: F5-UTC08-TC01, TC02, TC08. STC: STC-F5-03-TC-04..06.
for (const [id, baseline, partial] of [['04', 3, false], ['05', 0, false], ['06', 3, true]] as const) {
  test(`STC-F5-03-TC-${id} comparison growth and coverage`, async ({ tracking, page }) => {
    await tracking.seed([20], baseline, 6, partial);
    await page.goto('/tracking');
    await periods(page);
    await page.getByRole('button', { name: 'Compare periods', exact: true }).click();
    await expect(page.getByLabel('Period A link clicks', { exact: true })).toHaveText(String(baseline));
    await expect(page.getByLabel('Period B link clicks', { exact: true })).toHaveText('6');
    await expect(page.getByLabel('Click growth', { exact: true })).toHaveText(`+${6 - baseline} clicks`);
    await expect(page.getByLabel('Click growth rate', { exact: true })).toHaveText(baseline ? '+100%' : '—');
    if (partial) await expect(page.getByText('Partial coverage', { exact: true })).toBeVisible();
  });
}

// UTC: F5-UTC08-TC03, TC05, TC06. STC: STC-F5-03-TC-07..09.
test('STC-F5-03-TC-07..09 invalid periods never send a comparison request', async ({ tracking, page }) => {
  await tracking.seed();
  await page.clock.setFixedTime(new Date('2026-10-28T10:00:00Z'));
  let calls = 0;
  page.on('request', req => { if (req.url().includes('/api/tracking/comparison')) calls++; });
  await page.goto('/tracking');
  await periods(page, '2026-10-18', '2026-10-18');
  await expect(page.getByRole('button', { name: 'Compare periods', exact: true })).toBeDisabled();
  await periods(page, '2026-10-18', '2026-10-19', '2026-10-31');
  await expect(page.getByRole('button', { name: 'Compare periods', exact: true })).toBeDisabled();
  await periods(page, '2026-10-12');
  await page.getByRole('button', { name: 'Compare periods', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Start date must be before end date' })).toBeVisible();
  expect(calls).toBe(0);
});

// UTC: F5-UTC09. STC: STC-F5-04-TC-01..06.
test('STC-F5-04-TC-01..06 downloads match details, ranking and comparison', async ({ tracking, page, request }) => {
  await tracking.seed([10]);
  await page.goto('/tracking');
  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tracking details', exact: true }) });
  const pending = page.waitForEvent('download');
  await details.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('reelcast-tracking.csv');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
  const csv = bytes.toString('utf8');
  expect(csv).toContain('Reel / Platform,Views,Likes,Comments,Shares,Affiliate Link Clicks,Observed At (Asia/Bangkok)');
  expect(csv).toContain("'=BAD()");
  expect(csv).toContain('Unavailable');
  const pendingXlsx = page.waitForEvent('download');
  await details.getByRole('button', { name: 'XLSX', exact: true }).click();
  const xlsx = await pendingXlsx;
  expect(xlsx.suggestedFilename()).toBe('reelcast-tracking.xlsx');
  const book = workbook((await xlsx.path())!);
  expect(book.sheets).toEqual(['Summary', 'Details']);
  expect(book.frozen).toBe('frozen');
  expect(book.filter).toBe('A1:G2');
  expect(book.formulas).toBe(0);
  expect(book.text).toContain('=BAD()');
  await page.getByRole('combobox', { name: 'Ranking level' }).click();
  await page.getByRole('option', { name: 'Product', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByRole('button', { name: /#1 001สินค้า/ })).toBeVisible();
  const rankingSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Content ranking', exact: true }) });
  const pendingRanking = page.waitForEvent('download');
  await rankingSection.getByRole('button', { name: 'CSV', exact: true }).click();
  const ranking = (await readFile((await (await pendingRanking).path())!)).toString('utf8');
  expect(ranking).toContain('Rank,Product,Views,Observed At (Asia/Bangkok)');
  expect(ranking).toContain('1,001สินค้า,10,');
  await expect(rankingSection.getByRole('button', { name: /#1 001สินค้า/ })).toContainText('10');
  await periods(page);
  await page.getByRole('button', { name: 'Compare periods', exact: true }).click();
  const result = page.getByRole('region', { name: 'Period comparison results' });
  await expect(result).toBeVisible();
  const pendingComparison = page.waitForEvent('download');
  await result.getByRole('button', { name: 'CSV', exact: true }).click();
  const comparison = (await readFile((await (await pendingComparison).path())!)).toString('utf8');
  expect(comparison).toContain('Comparison Period');
  expect(comparison).toContain('Comparison Click Difference');
  expect(comparison).toContain('Comparison Percentage Change');
  expect(comparison).toContain('Coverage');
  // Remove report data after it rendered so the actual export button can show
  // the backend's no-data response without fabricating an API error.
  await query('DELETE FROM tracking_observations WHERE user_id=$1', [tracking.owner]);
  await query('DELETE FROM tracking_links WHERE user_id=$1', [tracking.owner]);
  let downloads = 0;
  page.on('download', () => downloads++);
  await details.getByRole('button', { name: 'CSV', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No tracking data matches these filters' })).toBeVisible();
  expect(downloads).toBe(0);
});
