import { expect, test } from "@playwright/test";

import {
  connectDB,
  deleteUserByEmail,
  disconnectDB,
  findUserByEmail,
} from "../../helpers/db-helper";
import {
  registerAndLogin,
  systemUser,
  totp,
} from "../../helpers/system-fixture";

test.describe("STC-F1-02 and STC-F1-03 Security and profile", () => {
  test.beforeAll(connectDB);
  test.afterAll(disconnectDB);

  test("updates the member display name", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-profile");
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/account");
      await page.locator("#name").fill("New Name");
      await page.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText("Profile saved successfully")).toBeVisible();

      const stored = await findUserByEmail(user.email);
      expect(stored?.display_name).toBe("New Name");
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("rejects invalid and oversized profile images", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-profile-image");
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/account");
      const input = page.locator('input[type="file"][accept="image/jpeg,image/png"]');
      await input.setInputFiles({
        name: "profile_invalid.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("gif"),
      });
      await expect(page.getByText(/Invalid file type/)).toBeVisible();

      await input.setInputFiles({
        name: "profile_oversize.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
      });
      await expect(page.getByText(/Maximum size is 2MB/)).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("sets up and verifies TOTP 2FA", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-setup-2fa");
    try {
      await registerAndLogin(page, request, user);
      await page.goto("/account");
      await page.getByRole("button", { name: /enable 2fa/i }).click();
      const secret = (await page.locator("code").textContent())?.trim();
      expect(secret).toBeTruthy();
      await page.getByRole("button", { name: /I've scanned/i }).click();
      await page.locator("input[data-input-otp]").fill(totp(secret!));
      await page.getByRole("button", { name: /verify & enable 2fa/i }).click();
      await expect(page.getByText("2FA Enabled!")).toBeVisible();

      const stored = await findUserByEmail(user.email);
      expect(stored?.is_2fa_enabled).toBe(true);
    } finally {
      await deleteUserByEmail(user.email);
    }
  });
});
