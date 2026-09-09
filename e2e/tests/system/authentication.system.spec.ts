import { expect, test } from "@playwright/test";

// UTC: F1-UTC01, F1-UTC02, F1-UTC04
// STC: STC-F1-01

import {
  configureUser2FA,
  connectDB,
  deleteUserByEmail,
  disconnectDB,
  verifyUserEmail,
} from "../../helpers/db-helper";
import {
  loginByUi,
  registerByApi,
  systemUser,
  totp,
} from "../../helpers/system-fixture";

test.describe("STC-F1-01 Authentication", () => {
  test.beforeAll(connectDB);
  test.afterAll(disconnectDB);

  test("registers, verifies, and logs in a member", async ({ page }, testInfo) => {
    const user = systemUser(testInfo, "stc-auth");
    try {
      await page.goto("/register");
      await page.locator("#name").fill(user.displayName);
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator("#confirm").fill(user.password);
      await page.getByRole("checkbox").click();
      await page.getByRole("button", { name: /create account/i }).click();
      await expect(page).toHaveURL(/verify_email_sent=1/);

      await verifyUserEmail(user.email);
      await loginByUi(page, user);
      await expect(page).toHaveURL(/\/$/);
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("rejects invalid registration inputs", async ({ page }) => {
    await page.goto("/register");
    await page.locator("#name").fill("JohnDoe");
    await page.locator("#email").fill("johndoe-example");
    await page.locator("#password").fill("weak");
    await page.locator("#confirm").fill("weak");
    await page.getByRole("checkbox").click();

    await expect
      .poll(() =>
        page.locator("#email").evaluate(
          (element: HTMLInputElement) => element.checkValidity(),
        ),
      )
      .toBe(false);

    await page.locator("#email").fill("johndoe@example.com");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/Password must include/i)).toBeVisible();
  });

  test("rejects registration with an existing email", async ({
    page,
    request,
  }, testInfo) => {
    const user = systemUser(testInfo, "stc-existing-email");
    try {
      await registerByApi(request, user);
      await page.goto("/register");
      await page.locator("#name").fill(user.displayName);
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.locator("#confirm").fill(user.password);
      await page.getByRole("checkbox").click();
      await page.getByRole("button", { name: /create account/i }).click();

      await expect(
        page.getByText(/EmailAlreadyExistsException/).first(),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("sends a password recovery request", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-reset");
    try {
      await registerByApi(request, user);
      await page.goto("/forgot-password");
      await page.locator("#email").fill(user.email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(page.getByText("Check your inbox")).toBeVisible();
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("requires TOTP when 2FA is enabled", async ({ page, request }, testInfo) => {
    const user = systemUser(testInfo, "stc-login-2fa");
    const secret = "JBSWY3DPEHPK3PXP";
    try {
      await registerByApi(request, user);
      await configureUser2FA(user.email, secret, true);

      await page.goto("/login");
      await page.locator("#email").fill(user.email);
      await page.locator("#password").fill(user.password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await expect(page.getByText("Two-Factor Authentication")).toBeVisible();
      await page.locator("input[data-input-otp]").fill(totp(secret));

      await expect(page).toHaveURL(/\/$/);
    } finally {
      await deleteUserByEmail(user.email);
    }
  });

  test("@external redirects to the Google OAuth consent flow", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Google" }).click();
    await expect(page).toHaveURL(
      /accounts\.google\.com|\/auth\/google\/login/,
      { timeout: 20_000 },
    );
  });
});
