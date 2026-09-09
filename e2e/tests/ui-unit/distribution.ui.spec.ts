import { expect, test } from "@playwright/test";

import { mockAuthenticatedUser } from "../../helpers/ui-mocks";

const account = {
  account_id: "22222222-2222-4222-8222-222222222222",
  platform_name: "tiktok",
};

const distribution = {
  distribution_id: "33333333-3333-4333-8333-333333333333",
  reel_id: "44444444-4444-4444-8444-444444444444",
  account_id: account.account_id,
  status: "Pending",
  scheduled_time: "2026-10-01T09:00:00Z",
  retry_count: 0,
  error_message: null,
  post_url: null,
  platform_name: "tiktok",
  reel_name: "Cold Brew launch",
  reel_prompt: "Make a cold brew launch reel",
  created_at: "2026-09-01T09:00:00Z",
};

test.describe("F3 UI unit tests", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test("F3-UTC03 confirms disconnect and removes an owned account", async ({ page }) => {
    let accounts = [account];
    await page.route("**/api/social/readiness", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ platforms: { tiktok: true, youtube: true, facebook: true, instagram: true } }),
    }));
    await page.route("**/api/social/accounts**", async (route) => {
      if (route.request().method() === "DELETE") {
        accounts = [];
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ accounts, total: accounts.length }) });
    });

    await page.goto("/account");
    await page.getByRole("button", { name: "Disconnect TikTok" }).click();
    await page.getByRole("button", { name: /Disconnect permanently/i }).click();

    await expect(page.getByText("Not connected", { exact: true }).first()).toBeVisible();
  });

  test("F3-UTC05/06/08 lists a distribution and invokes publish-now and cancel", async ({ page }) => {
    const calls: string[] = [];
    await page.route("**/api/social/accounts", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ accounts: [account], total: 1 }),
    }));
    await page.route("**/api/distributions/recent-campaigns**", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ campaign_ids: [], total: 0 }),
    }));
    await page.route("**/api/library", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ campaigns: [], products: [], total: 0 }),
    }));
    await page.route("**/api/distributions**", async (route) => {
      const request = route.request();
      if (request.method() === "POST" || request.method() === "DELETE") calls.push(request.url());
      await route.fulfill({
        status: request.method() === "DELETE" ? 204 : 200,
        contentType: "application/json",
        body: JSON.stringify({ distributions: [distribution], total: 1 }),
      });
    });

    await page.goto("/distribute");
    await expect(page.getByText("Cold Brew launch")).toBeVisible();
    await page.getByRole("button", { name: "Publish now" }).click();
    await page.getByTitle("Cancel").click();

    await expect.poll(() => calls.some((url) => url.includes("/publish-now"))).toBeTruthy();
    await expect.poll(() => calls.some((url) => url.endsWith(distribution.distribution_id))).toBeTruthy();
  });
});
