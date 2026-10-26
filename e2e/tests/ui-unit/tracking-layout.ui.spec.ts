import { expect, test } from "@playwright/test";
import { mockAuthenticatedUser } from "../../helpers/ui-mocks";

const reelName = "A young man walks slowly through a dark, misty forest at twilight, carrying a lantern and looking for a hidden path. ".repeat(3);

for (const width of [375, 1440]) {
  test(`long Reel names stay inside tracking filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAuthenticatedUser(page);
    await page.route("**/api/tracking/sync/latest", route => route.fulfill({ json: null }));
    await page.route("**/api/tracking/dashboard*", route => route.fulfill({ json: {
      totals: { views: null, likes: null, comments: null, shares: null, engagement: null, clicks: 0, reels: 1, partial_metrics: [] },
      details: [], click_trend: [], platforms: [], products: [], campaigns: [], reels: [], accounts: [],
      has_data: true, semantics: "", generated_at: "2026-10-26T00:00:00Z", unrelated_observations: 0,
    } }));
    await page.route("**/api/tracking/filter-options", route => route.fulfill({ json: {
      platforms: ["youtube"], campaigns: [], products: [], reels: [{ id: "reel-1", name: reelName }],
      distributions: [{ id: "distribution-1", name: reelName, platform: "youtube", campaign_id: null, product_id: null, reel_id: "reel-1" }],
    } }));
    await page.goto("/tracking");
    const trigger = page.getByRole("combobox", { name: "Reel", exact: true });
    const original = await trigger.boundingBox();
    expect(original).not.toBeNull();
    await trigger.click();
    const option = page.getByRole("option", { name: reelName, exact: true });
    await expect(option).toBeVisible();
    const listbox = await page.getByRole("listbox").boundingBox();
    expect(listbox).not.toBeNull();
    expect(listbox!.x).toBeGreaterThanOrEqual(0);
    expect(listbox!.x + listbox!.width).toBeLessThanOrEqual(width);
    await option.click();
    await expect(trigger).toContainText(reelName);
    const selected = await trigger.boundingBox();
    expect(selected!.width).toBeLessThanOrEqual(original!.width + 1);
    const bounds = await trigger.evaluate(element => {
      const trigger = element.getBoundingClientRect();
      const value = element.querySelector(":scope > span")!.getBoundingClientRect();
      const arrow = element.querySelector(":scope > svg")!.getBoundingClientRect();
      return { triggerRight: trigger.right, valueRight: value.right, arrowRight: arrow.right, arrowWidth: arrow.width };
    });
    expect(bounds.valueRight).toBeLessThanOrEqual(bounds.triggerRight);
    expect(bounds.arrowRight).toBeLessThanOrEqual(bounds.triggerRight);
    expect(bounds.arrowWidth).toBeGreaterThanOrEqual(15);
    await expect(trigger).toHaveAttribute("title", reelName);
  });
}
