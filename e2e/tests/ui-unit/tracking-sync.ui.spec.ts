import { test, expect, type Page } from '@playwright/test';
import { mockAuthenticatedUser } from '../../helpers/ui-mocks';

const running = { job_id: 'run-1', status: 'running', active: true, social_metrics: 0,
  accounts: [{ job_id: 'account-job', account_id: 'account', platform: 'facebook', status: 'running',
    metrics: 0, completed_posts: 0, total_posts: 8, success: false, error: null, warnings: [], next_attempt_at: null }] };
const done = { ...running, status: 'done', active: false, social_metrics: 8,
  accounts: [{ ...running.accounts[0], status: 'done', metrics: 8, completed_posts: 8, success: true }] };

async function setup(page: Page) {
  await mockAuthenticatedUser(page);
  await page.route('**/api/tracking/dashboard*', route => route.fulfill({ json: {
    totals: { views: null, likes: null, comments: null, shares: null, engagement: null, clicks: 0, reels: 0, partial_metrics: [] },
    details: [], click_trend: [], platforms: [], products: [], campaigns: [], reels: [], accounts: [],
    has_data: false, semantics: '', generated_at: '2026-10-17T00:00:00Z', unrelated_observations: 0,
  } }));
  await page.route('**/api/tracking/filter-options', route => route.fulfill({ json: {
    platforms: [], products: [], campaigns: [], reels: [], distributions: [],
  } }));
}

test('Sync accepts a background run and displays completion without another POST', async ({ page }) => {
  await setup(page);
  let posts = 0;
  await page.route('**/api/tracking/sync/latest', route => route.fulfill({ json: null }));
  await page.route('**/api/tracking/sync', route => { posts++; return route.fulfill({ status: 202, json: running }); });
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/tracking/sync/run-1', async route => { await finished; await route.fulfill({ json: done }); });
  await page.goto('/tracking');
  await page.getByRole('button', { name: 'Sync Data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Syncing…', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Synchronization status' })).toContainText('0/8 posts processed');
  finish();
  await expect(page.getByText('Synchronization complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync Data', exact: true })).toBeEnabled();
  expect(posts).toBe(1);
});

test('Tracking restores a running job and shows partial results honestly', async ({ page }) => {
  await setup(page);
  let posts = 0;
  await page.route('**/api/tracking/sync', route => { posts++; return route.fulfill({ status: 202, json: running }); });
  await page.route('**/api/tracking/sync/latest', route => route.fulfill({ json: running }));
  await page.route('**/api/tracking/sync/run-1', route => route.fulfill({ json: {
    ...done, status: 'partial', accounts: [{ ...done.accounts[0], status: 'partial', success: false,
      warnings: ['Incomplete posts kept their previous values and observation time'] }],
  } }));
  await page.goto('/tracking');
  await expect(page.getByText('Synchronization finished with some unavailable data', { exact: true })).toBeVisible();
  await expect(page.getByText('Incomplete posts kept their previous values and observation time', { exact: true })).toBeVisible();
  expect(posts).toBe(0);
});
