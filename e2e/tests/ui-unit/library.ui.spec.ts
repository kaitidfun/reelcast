import { expect, test } from "@playwright/test";

import {
  mockAuthenticatedUser,
  UI_LIBRARY,
} from "../../helpers/ui-mocks";

test.describe("UI unit: F4 campaign and product library", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
  });

  test("F4-UTC01-TC01 creates a campaign and F4-UTC03 filters it", async ({ page }) => {
    const library = structuredClone(UI_LIBRARY);
    await page.route("**/api/library", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(library),
      });
    });
    await page.route("**/api/campaigns", async (route) => {
      const body = route.request().postDataJSON();
      library.campaigns.push({
        campaign_id: "66666666-6666-4666-8666-666666666666",
        name: body.name,
        description: body.description,
        banner_color: body.banner_color,
        banner_image_url: null,
        created_at: "2026-06-19T00:00:00Z",
        updated_at: "2026-06-19T00:00:00Z",
      });
      library.total = library.campaigns.length;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(library.campaigns.at(-1)),
      });
    });

    await page.goto("/library");
    await page.getByRole("button", { name: /New Campaign/i }).click();
    await page.locator("#campaign-name").fill("Winter Cocoa");
    await page.locator("#campaign-desc").fill("Winter promotion");
    await page.getByRole("button", { name: /Create Campaign/i }).click();
    await expect(page.getByText("Winter Cocoa").first()).toBeVisible();

    await page.getByPlaceholder("Search campaigns…").fill("Summer");
    await expect(page.getByText("Summer 2026").first()).toBeVisible();
    await expect(page.getByText("Winter Cocoa").first()).toBeHidden();
  });

  test("F4-UTC01-TC02 displays duplicate campaign error", async ({ page }) => {
    await page.route("**/api/library", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(UI_LIBRARY),
      });
    });
    await page.route("**/api/campaigns", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "DuplicateCampaignNameException",
        }),
      });
    });

    await page.goto("/library");
    await page.getByRole("button", { name: /New Campaign/i }).click();
    await page.locator("#campaign-name").fill("Summer 2026");
    await page.getByRole("button", { name: /Create Campaign/i }).click();

    await expect(page.getByText(/DuplicateCampaignNameException/)).toBeVisible();
  });

  test("F4-UTC03-TC02 shows the empty state", async ({ page }) => {
    await page.route("**/api/library", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ campaigns: [], products: [], total: 0 }),
      });
    });

    await page.goto("/library");
    await expect(page.getByRole("button", { name: /New Campaign/i })).toBeVisible();
    await expect(page.locator("h3")).toHaveCount(0);
  });

  test("F4-UTC03-TC03 shows database retrieval failure", async ({ page }) => {
    await page.route("**/api/library", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "DatabaseRetrieveException" }),
      });
    });

    await page.goto("/library");
    await expect(
      page.getByText("DatabaseRetrieveException", { exact: true }).first(),
    ).toBeVisible();
  });
});
