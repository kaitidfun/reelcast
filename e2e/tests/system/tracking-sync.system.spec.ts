import { expect, test } from '@playwright/test';
import { connectDB, disconnectDB, deleteUserByEmail } from '../../helpers/db-helper';
import { authToken, loginByUi, registerAndLogin, systemUser } from '../../helpers/system-fixture';

const backend = process.env.BACKEND_URL ?? 'http://localhost:8000';

// F5-UTC06-TC10; STC-F5-01-TC-05: no accounts, observations or sync run.
test('STC-F5-01-TC-05 member without a connection sees the empty state', async ({ page, request }, testInfo) => {
  await connectDB();
  const user = systemUser(testInfo, 'stc-f5-no-account');
  try {
    await registerAndLogin(page, request, user);
    const token = await authToken(page);
    await page.goto('/tracking');
    await expect(page.getByRole('heading', { name: 'Your tracking starts here' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync Data', exact: true })).toHaveCount(0);
    const latest = await request.get(`${backend}/api/tracking/sync/latest`, { headers: { Authorization: `Bearer ${token}` } });
    expect(latest.ok()).toBeTruthy();
    expect(await latest.json()).toBeNull();
  } finally { await deleteUserByEmail(user.email); await disconnectDB(); }
});

// UTC: F5-UTC01, F5-UTC03. STC: STC-F5-01-TC-01..04.
// Dedicated test members must already have a Published YouTube Distribution
// and a product affiliate URL. Success/revoked accounts are kept separate.
// These tests intentionally use the actual broker, worker and OAuth provider.
for (const scenario of ['SUCCESS', 'REVOKED'] as const) {
  test(`STC-F5-01 ${scenario === 'SUCCESS' ? 'TC-01..03' : 'TC-04'} real OAuth sync @external`, async ({ page, request }) => {
    const email = process.env[`TRACKING_E2E_${scenario}_EMAIL`];
    const password = process.env[`TRACKING_E2E_${scenario}_PASSWORD`];
    test.skip(!email || !password, `Set TRACKING_E2E_${scenario}_EMAIL/PASSWORD for the dedicated OAuth test member`);
    test.setTimeout(180_000);
    await loginByUi(page, { email: email!, password: password!, displayName: 'Tracking external test' });
    const token = await authToken(page);
    const options = { headers: { Authorization: `Bearer ${token}` } };
    const before = await request.get(`${backend}/api/tracking/dashboard`, options);
    const previous = await before.json();
    expect(previous.accounts.some((a: { platform: string }) => a.platform === 'youtube')).toBe(true);
    expect(previous.details.length).toBeGreaterThan(0);
    await page.goto('/tracking');
    const accepted = page.waitForResponse(r => r.url().endsWith('/api/tracking/sync') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sync Data', exact: true }).click();
    const response = await accepted;
    expect(response.status()).toBe(202);
    const run = await response.json();
    expect(run.active).toBe(true);
    await expect(page.getByRole('button', { name: 'Syncing…', exact: true })).toBeDisabled();
    // TC-03: duplicate request while the UI button is disabled uses the same run.
    const duplicate = await request.post(`${backend}/api/tracking/sync`, options);
    expect((await duplicate.json()).job_id).toBe(run.job_id);
    // TC-02: navigate away/reopen; restore the durable run without another POST.
    await page.goto('/');
    await page.goto('/tracking');
    await expect.poll(async () => {
      const status = await request.get(`${backend}/api/tracking/sync/${run.job_id}`, options);
      return (await status.json()).active;
    }, { timeout: 150_000 }).toBe(false);
    await expect(page.getByRole('button', { name: 'Sync Data', exact: true })).toBeEnabled({ timeout: 15_000 });
    const final = await (await request.get(`${backend}/api/tracking/dashboard`, options)).json();
    if (scenario === 'SUCCESS') {
      expect(final.accounts.find((a: { platform: string }) => a.platform === 'youtube').last_synced_at).toBeTruthy();
      await expect(page.getByRole('region', { name: 'Tracking details table', exact: true })).toBeVisible();
    } else {
      const status = await (await request.get(`${backend}/api/tracking/sync/${run.job_id}`, options)).json();
      expect(['failed', 'partial']).toContain(status.status);
      await expect(page.getByRole('alert').filter({ hasText: /reconnect/i }).first()).toBeVisible();
      expect(final.details).toEqual(previous.details);
    }
  });
}
