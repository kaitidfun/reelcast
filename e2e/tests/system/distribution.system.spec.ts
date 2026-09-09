import { expect, test } from "@playwright/test";

import { connectDB, deleteUserByEmail, disconnectDB } from "../../helpers/db-helper";
import { registerAndLogin, systemUser } from "../../helpers/system-fixture";

test.describe("STC-F3-02 Reel Distribution Management", () => {
  test.beforeAll(connectDB);
  test.afterAll(disconnectDB);

  test("shows the empty state and never exposes another member's distributions", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-f3-empty-distributions");
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/distribute");

      await expect(page.getByText("No distributions yet. Publish a completed Reel to a connected account from the Create page.")).toBeVisible();
      await expect(page.getByText("0/4 Platforms Connected")).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
