import { expect, test } from "@playwright/test";

import {
  connectDB,
  deleteUserByEmail,
  disconnectDB,
} from "../../helpers/db-helper";
import {
  registerAndLogin,
  systemUser,
} from "../../helpers/system-fixture";

test.describe("STC-F4-01 Campaign and product library", () => {
  test.beforeAll(connectDB);
  test.afterAll(disconnectDB);

  test("creates a campaign, saves a draft product, and browses it", async ({
    page,
    request,
  }, testInfo) => {
    const user = systemUser(testInfo, "stc-library");
    const campaignName = `Summer ${Date.now()}`;
    const productName = `Cold Brew ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/library");
      await page.getByRole("button", { name: /New Campaign/i }).click();
      await page.locator("#campaign-name").fill(campaignName);
      await page.locator("#campaign-desc").fill("Promo");
      await page.getByRole("button", { name: /Create Campaign/i }).click();
      await expect(page.getByText(campaignName).first()).toBeVisible();

      await page.getByRole("heading", {
        name: campaignName,
        exact: true,
      }).click();
      await page.getByRole("button", { name: /Add Product/i }).click();
      await page.locator("#product-name").fill(productName);
      await page.getByRole("button", { name: /Save Product/i }).click();

      await expect(page.getByText(productName).first()).toBeVisible();
      await expect(page.getByText("Draft").first()).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("rejects a duplicate campaign name", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-duplicate-campaign");
    const campaignName = `Duplicate ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/library");
      for (let index = 0; index < 2; index += 1) {
        await page.getByRole("button", { name: /New Campaign/i }).click();
        await page.locator("#campaign-name").fill(campaignName);
        await page.getByRole("button", { name: /Create Campaign/i }).click();
        if (index === 0) {
          await expect(page.getByText(campaignName).first()).toBeVisible();
        }
      }
      await expect(page.getByText(/DuplicateCampaignNameException/)).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("shows an empty state for a new member", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-empty-library");
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/library");
      await expect(page.getByRole("button", { name: /New Campaign/i })).toBeVisible();
      await expect(page.locator("h3")).toHaveCount(0);
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
