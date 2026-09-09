import { expect, test } from "@playwright/test";

// UTC: F1-UTC03, F1-UTC04
// STC: STC-F1-02, STC-F1-03

import { mockAuthenticatedUser } from "../../helpers/ui-mocks";

test.describe("UI unit: F1 profile and 2FA", () => {
  test("F1-UTC03-TC01 updates the display name", async ({ page }) => {
    const user = await mockAuthenticatedUser(page);
    await page.unroute("**/me");
    await page.route("**/me", async (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        user.display_name = body.display_name;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(user),
      });
    });

    await page.goto("/account");
    await page.locator("#name").fill("New Name");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(
      page.getByText("Profile saved successfully", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator("#name")).toHaveValue("New Name");
  });

  test("F1-UTC03-TC02 and TC03 reject invalid profile images", async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto("/account");
    const input = page.locator('input[type="file"][accept="image/jpeg,image/png"]');

    await input.setInputFiles({
      name: "profile_invalid.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("gif"),
    });
    await expect(page.getByText(/Invalid file type/).first()).toBeVisible();

    await input.setInputFiles({
      name: "profile_oversize.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.getByText(/Maximum size is 5MB/).first()).toBeVisible();
  });

  test("F1-UTC04-TC01 enables 2FA with a valid code", async ({ page }) => {
    const user = await mockAuthenticatedUser(page);
    await page.route("**/api/2fa/enable", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          qr_code: "data:image/png;base64,iVBORw0KGgo=",
        }),
      });
    });
    await page.route("**/api/2fa/verify-setup", async (route) => {
      user.is_2fa_enabled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ is_2fa_enabled: true }),
      });
    });

    await page.goto("/account");
    await page.getByRole("button", { name: /enable 2fa/i }).click();
    await page.getByRole("button", { name: /I've scanned/i }).click();
    await page.locator("input[data-input-otp]").fill("123456");

    await expect(
      page.getByText("2FA Enabled!", { exact: true }).first(),
    ).toBeVisible();
  });

  test("F1-UTC04-TC02 and TC03 show invalid-code feedback", async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.route("**/api/2fa/enable", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          qr_code: "data:image/png;base64,iVBORw0KGgo=",
        }),
      });
    });
    await page.route("**/api/2fa/verify-setup", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "InvalidVerificationCodeException: Invalid code",
        }),
      });
    });

    await page.goto("/account");
    await page.getByRole("button", { name: /enable 2fa/i }).click();
    await page.getByRole("button", { name: /I've scanned/i }).click();
    await expect(
      page.getByRole("button", { name: /verify & enable 2fa/i }),
    ).toBeDisabled();
    await page.locator("input[data-input-otp]").fill("000000");

    await expect(
      page
        .getByText(/InvalidVerificationCodeException/)
        .first(),
    ).toBeVisible();
  });
});
