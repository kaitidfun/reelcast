import { expect, test } from "@playwright/test";

import {
  connectDB,
  deleteUserByEmail,
  disconnectDB,
} from "../../helpers/db-helper";
import {
  authToken,
  createCampaignAndProduct,
  registerAndLogin,
  selectSystemProduct,
  systemUser,
} from "../../helpers/system-fixture";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

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
      await expect(prompt).toHaveValue(/Unboxing/);

      await page.getByRole("button", { name: /Clear all/i }).click();
      for (const option of [
        "Unboxing",
        "Teens / Gen Z",
        "Fun & Energetic",
        "Golden Hour",
        "Cinematic",
        "Slow Zoom In",
      ]) {
        await page.getByRole("button", {
          name: option,
          exact: true,
        }).click();
      }
      await page.getByRole("button", { name: /Auto-Build Prompt/i }).click();
      await expect(prompt).toHaveValue(/Slow Zoom In/);
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

      const token = await authToken(page);
      const missingProductResponse = await request.post(
        `${BACKEND_URL}/api/reels/generate-prompt`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            template_type: "flash_sale",
            product_id: "550e8400-e29b-41d4-a716-446655449999",
            duration: 30,
          },
        },
      );
      expect(missingProductResponse.status()).toBe(404);
      expect((await missingProductResponse.json()).exception).toBe(
        "ProductNotFoundException",
      );

      const emptyEnhanceResponse = await request.post(
        `${BACKEND_URL}/api/reels/enhance-prompt`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            prompt_text: "",
            product_id: null,
            duration: 30,
          },
        },
      );
      expect(emptyEnhanceResponse.status()).toBe(400);
      expect((await emptyEnhanceResponse.json()).exception).toBe(
        "InvalidPromptException",
      );
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
