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

// UTC: F3-UTC03, F3-UTC05, F3-UTC06, F3-UTC08, F3-UTC10
// STC: STC-F3-01, STC-F3-02, STC-F3-03
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

  test("F3-UTC05/06 filters, searches, groups, and pages distribution history", async ({ page }) => {
    const historyRequests: string[] = [];
    const groupedReel = {
      reel_id: "55555555-5555-4555-8555-555555555555",
      reel_name: "Grouped Coffee Reel",
      reel_prompt: "A grouped coffee reel",
      last_activity_at: "2026-09-02T09:00:00Z",
      platforms: [{
        distribution_id: distribution.distribution_id,
        account_id: account.account_id,
        platform_name: "tiktok",
        status: "Pending",
        scheduled_time: distribution.scheduled_time,
        created_at: distribution.created_at,
        error_message: null,
        post_url: null,
      }],
    };

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
      const url = route.request().url();
      historyRequests.push(url);
      const isGrouped = new URL(url).pathname.endsWith("/by-reel");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(isGrouped ? { reels: [groupedReel], total: 1 } : { distributions: [distribution], total: 11 }),
      });
    });

    await page.goto("/distribute");
    await expect(page.getByText("Showing distributions 1-10 of 11")).toBeVisible();

    await page.getByRole("button", { name: "Pending", exact: true }).click();
    await expect.poll(() => historyRequests.some((url) => url.includes("status_filter=Pending"))).toBeTruthy();

    await page.getByPlaceholder("Search reels…").fill("coffee");
    await expect.poll(() => historyRequests.some((url) => url.includes("search=coffee"))).toBeTruthy();

    await page.getByRole("button", { name: "Next", exact: true }).first().click();
    await expect.poll(() => historyRequests.some((url) => url.includes("skip=10"))).toBeTruthy();

    await page.getByRole("radio", { name: "Grouped by reel" }).click();
    await expect(page.getByText("Grouped Coffee Reel")).toBeVisible();
    await expect.poll(() => historyRequests.some((url) => url.includes("/distributions/by-reel?"))).toBeTruthy();
  });

  test("F3-UTC10 reschedules a pending distribution from its detail page", async ({ page }) => {
    const methods: string[] = [];
    let rescheduleBody = "";
    await page.route("**/api/reels/*/status", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ raw_video_url: null, final_commercial_video_url: null }),
    }));
    await page.route("**/api/distributions**", async (route) => {
      const request = route.request();
      methods.push(`${request.method()} ${request.url()}`);
      if (request.method() === "PATCH") rescheduleBody = request.postData() ?? "";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ distributions: [distribution], total: 1 }),
      });
    });

    await page.goto(`/distribute/${distribution.reel_id}`);
    await page.getByRole("button", { name: "Edit time" }).click();
    await page.locator('input[type="datetime-local"]').fill("2026-10-05T12:30");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect.poll(() => methods.some((entry) => entry.startsWith("PATCH "))).toBeTruthy();
    expect(JSON.parse(rescheduleBody)).toEqual(expect.objectContaining({ scheduled_time: expect.any(String) }));
  });

  test("F3-UTC08 retries a failed distribution from its detail page", async ({ page }) => {
    const failedDistribution = { ...distribution, status: "Failed", error_message: "TikTok temporarily unavailable" };
    const calls: string[] = [];
    await page.route("**/api/reels/*/status", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ raw_video_url: null, final_commercial_video_url: null }),
    }));
    await page.route("**/api/distributions**", async (route) => {
      const request = route.request();
      if (request.method() === "POST") calls.push(request.url());
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ distributions: [failedDistribution], total: 1 }),
      });
    });

    await page.goto(`/distribute/${distribution.reel_id}`);
    await expect(page.getByText("TikTok temporarily unavailable")).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();

    await expect.poll(() => calls.some((url) => url.includes(`${distribution.distribution_id}/publish-now`))).toBeTruthy();
  });
});
