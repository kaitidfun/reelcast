import { test, expect } from "@playwright/test";
import { mockAuthenticatedUser, mockLibrary, selectColdBrewProduct, UI_LIBRARY } from "../../helpers/ui-mocks";

test("Home requests recent items first and retains Show all for both lists", async ({ page }) => {
  await mockAuthenticatedUser(page);
  const reelLimits: number[] = [], campaignLimits: number[] = [];
  await page.route('**/api/reels?*', async route => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit'));
    reelLimits.push(limit);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ total: 10,
      reels: Array.from({ length: Math.min(limit, 10) }, (_, i) => ({ reel_id: `reel-${i}`, name: `Reel ${i}`,
        status: 'Completed', created_at: '2026-01-01T00:00:00Z' })) }) });
  });
  await page.route('**/api/library*', async route => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit') || 100);
    campaignLimits.push(limit);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ total: 5, products: [],
      campaigns: Array.from({ length: Math.min(limit, 5) }, (_, i) => ({ ...UI_LIBRARY.campaigns[0],
        campaign_id: `campaign-${i}`, name: `Campaign ${i}` })) }) });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Show all', exact: true })).toHaveCount(2);
  expect(reelLimits[0]).toBe(8); expect(campaignLimits[0]).toBe(3);
  await page.getByRole('button', { name: 'Show all', exact: true }).first().click();
  await expect(page.getByText('Reel 9', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page.getByText('Campaign 4', { exact: true })).toBeVisible();
  expect(campaignLimits.at(-1)).toBe(100);
});

test("library pages and searches request the matching server scope", async ({ page }) => {
  await mockAuthenticatedUser(page);
  const campaigns = Array.from({ length: 25 }, (_, index) => ({ ...UI_LIBRARY.campaigns[0],
    campaign_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: `Campaign ${String(index).padStart(2, "0")}` }));
  const requests: URL[] = [];
  await page.route("**/api/library*", async route => {
    const url = new URL(route.request().url()); requests.push(url);
    const search = url.searchParams.get("searchKeyword") || "";
    const rows = campaigns.filter(row => row.name.toLowerCase().includes(search.toLowerCase()));
    const skip = Number(url.searchParams.get("skip") || 0);
    const limit = Number(url.searchParams.get("limit") || 100);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      campaigns: rows.slice(skip, skip + limit), products: [], total: rows.length,
    }) });
  });
  await page.goto("/library");
  await expect(page.getByText("Campaign 00", { exact: true })).toBeVisible();
  await expect(page.getByText("Campaign 24", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Campaign 24", { exact: true })).toBeVisible();
  expect(requests.some(url => url.searchParams.get("skip") === "20")).toBe(true);
  await page.getByPlaceholder("Search campaigns…").fill("Campaign 24");
  await expect(page.getByText("Campaign 20", { exact: true })).toBeHidden();
  await expect.poll(() => requests.at(-1)?.searchParams.get("searchKeyword")).toBe("Campaign 24");
  await expect(page.getByText("Campaign 24", { exact: true })).toBeVisible();
});

test("direct video upload sends file slices and renders the completed Reel", async ({ page, baseURL }) => {
  await mockAuthenticatedUser(page);
  await mockLibrary(page);
  const uploaded: number[] = [];
  let completeBody: { parts?: unknown[] } = {};
  await page.route("**/api/reel-uploads/init", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ token: "intent", part_size: 3, parts: [1, 2].map(part_number => ({
      part_number, url: `${baseURL}/test-upload/${part_number}`,
    })) }) }));
  await page.route("**/test-upload/*", async route => {
    uploaded.push(route.request().postDataBuffer()?.length || 0);
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ status: 200, headers: { ETag: '"part-etag"' }, body: "" });
  });
  await page.route("**/api/reel-uploads/complete", async route => {
    completeBody = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ reel_id: "direct-reel", status: "Pending" }) });
  });
  await page.route("**/api/reels/direct-reel/status", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ reel_id: "direct-reel", status: "Completed", final_commercial_video_url: "https://example.com/reel.mp4",
      caption_and_hashtags: { caption: "Direct upload complete", hashtags: [] } }) }));
  await page.goto("/create");
  await selectColdBrewProduct(page);
  await page.getByRole("button", { name: "Upload Video", exact: true }).click();
  await page.locator('input[type="file"][accept*=".mp4"]').setInputFiles({
    name: "video.mp4", mimeType: "video/mp4", buffer: Buffer.from("abcdef"),
  });
  await page.getByRole("button", { name: /Upload & Process/i }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 20000 });
  expect(uploaded).toEqual([3, 3]);
  expect(completeBody.parts).toHaveLength(2);
});
