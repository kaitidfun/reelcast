import { expect, test } from "@playwright/test";

import {
  connectDB,
  deleteUserByEmail,
  disconnectDB,
} from "../../helpers/db-helper";
import {
  createCampaignAndProduct,
  registerAndLogin,
  selectSystemProduct,
  systemUser,
} from "../../helpers/system-fixture";

test.describe("STC-F2-01 Prompt assembly", () => {
  test.beforeAll(connectDB);
  test.afterAll(disconnectDB);

  test("supports manual, Guide Me, template, and Enhance prompt flows", async ({
    page,
    request,
  }, testInfo) => {
    const user = systemUser(testInfo, "stc-prompt");
    const campaign = `Prompt Campaign ${Date.now()}`;
    const product = `Cold Brew ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await createCampaignAndProduct(page, request, { campaign, product });
      await page.goto("/create");
      await selectSystemProduct(page, campaign, product);

      const prompt = page.locator("textarea").first();
      await prompt.fill("Cold brew coffee video");
      await page.getByRole("button", { name: /^enhance$/i }).click();
      await expect(prompt).not.toHaveValue("Cold brew coffee video");

      await page.getByRole("button", { name: /Product Showcase/i }).click();
      await expect(prompt).toHaveValue(/.+/);

      await page.getByRole("button", { name: /Guide Me/i }).click();
      await page.getByRole("button", { name: "Unboxing" }).click();
      await page.getByRole("button", { name: /Auto-Build Prompt/i }).click();
      await expect(prompt).toHaveValue(/.+/);
      await expect(page.getByText(/\/500$/)).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("enforces prompt input constraints", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-prompt-limit");
    const campaign = `Limit Campaign ${Date.now()}`;
    const product = `Limit Product ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await createCampaignAndProduct(page, request, { campaign, product });
      await page.goto("/create");
      await selectSystemProduct(page, campaign, product);
      const prompt = page.locator("textarea").first();
      await prompt.fill("x".repeat(501));
      await expect(
        page.getByRole("button", { name: /Generate Video/i }),
      ).toBeDisabled();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
