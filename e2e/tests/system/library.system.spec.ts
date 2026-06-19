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

      await page.getByText("Campaigns", { exact: true }).click();
      await page.getByPlaceholder("Search campaigns…").fill("Cold Brew");
      await expect(
        page.getByRole("heading", { name: campaignName }),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("saves incomplete product particulars as Draft", async ({
    page,
    request,
  }, testInfo) => {
    const user = systemUser(testInfo, "stc-draft-product");
    const campaignName = `Draft Campaign ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/library");
      await page.getByRole("button", { name: /New Campaign/i }).click();
      await page.locator("#campaign-name").fill(campaignName);
      await page.getByRole("button", { name: /Create Campaign/i }).click();
      await page.getByRole("heading", {
        name: campaignName,
        exact: true,
      }).click();
      await page.getByRole("button", { name: /Add Product/i }).click();
      await page.getByRole("button", { name: /Save Product/i }).click();

      await expect(page.getByText("Untitled Product").first()).toBeVisible();
      await expect(page.getByText("Draft").first()).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("rejects more than five product images", async ({
    page,
    request,
  }, testInfo) => {
    const user = systemUser(testInfo, "stc-max-images");
    const campaignName = `Image Campaign ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/library");
      await page.getByRole("button", { name: /New Campaign/i }).click();
      await page.locator("#campaign-name").fill(campaignName);
      await page.getByRole("button", { name: /Create Campaign/i }).click();
      await page.getByRole("heading", {
        name: campaignName,
        exact: true,
      }).click();
      await page.getByRole("button", { name: /Add Product/i }).click();
      await page
        .locator('input[type="file"][multiple]')
        .setInputFiles(
          Array.from({ length: 6 }, (_, index) => ({
            name: `photo${index + 1}.jpg`,
            mimeType: "image/jpeg",
            buffer: Buffer.from(`image-${index + 1}`),
          })),
        );

      await expect(
        page.getByText(/Maximum 5 images allowed per product/),
      ).toBeVisible();
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
      await expect(
        page.getByRole("heading", { name: "Create your first campaign" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Create First Campaign/i }),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
