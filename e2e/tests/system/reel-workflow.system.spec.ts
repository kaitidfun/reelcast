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

test.describe("STC-F2-02 through STC-F2-05 Reel workflows", () => {
  test.beforeAll(connectDB);
  test.afterAll(disconnectDB);

  test("rejects an unsupported custom Reel format", async ({
    page,
    request,
  }, testInfo) => {
    const user = systemUser(testInfo, "stc-upload-format");
    const campaign = `Upload Campaign ${Date.now()}`;
    const product = `Upload Product ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await createCampaignAndProduct(page, request, { campaign, product });
      await page.goto("/create");
      await selectSystemProduct(page, campaign, product);
      await page.getByRole("button", { name: /Upload Video/i }).click();
      await page.locator('input[type="file"][accept*=".mp4"]').setInputFiles({
        name: "commercial_invalid.mkv",
        mimeType: "video/x-matroska",
        buffer: Buffer.from("invalid-video"),
      });
      await page.getByRole("button", { name: /Upload & Process/i }).click();

      await expect(
        page
          .getByLabel("Notifications (F8)")
          .getByText(
            /UnsupportedVideoFormatException|Unsupported video format/,
          )
          .first(),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("@external generates, approves, rejects, and regenerates a Reel", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(240_000);
    const user = systemUser(testInfo, "stc-generation");
    const campaign = `Generation Campaign ${Date.now()}`;
    const product = `Generation Product ${Date.now()}`;
    try {
      await registerAndLogin(page, request, user);
      await createCampaignAndProduct(page, request, { campaign, product });
      await page.goto("/create");
      await selectSystemProduct(page, campaign, product);
      const prompt = page.getByPlaceholder(/Describe the Reel/i);
      await prompt.fill("A cinematic cold brew coffee video");
      await page.getByRole("button", { name: /Generate Video/i }).click();

      await expect(page.getByText("Ready", { exact: true })).toBeVisible({
        timeout: 180_000,
      });
      await page.getByRole("button", { name: /approve/i }).click();
      await expect(page.getByText(/approved/i).first()).toBeVisible();

      await prompt.fill("A cinematic slow-motion cold brew video");
      await page.getByRole("button", { name: /Re-generate Entire Reel/i }).click();
      await expect(page.getByText("Ready", { exact: true })).toBeVisible({
        timeout: 180_000,
      });
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
