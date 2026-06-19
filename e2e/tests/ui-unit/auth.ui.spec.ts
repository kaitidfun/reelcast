import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

test.describe("UI unit: F1 authentication", () => {
  test("F1-UTC01-TC01 registers valid guest data", async ({ page }) => {
    await page.route(`${BACKEND_URL}/register`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "registration-token",
          token_type: "bearer",
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "johndoe@example.com",
            display_name: "JohnDoe",
            is_email_verified: false,
            is_2fa_enabled: false,
          },
        }),
      });
    });

    await page.goto("/register");
    await page.locator("#name").fill("JohnDoe");
    await page.locator("#email").fill("johndoe@example.com");
    await page.locator("#password").fill("StrongPassword123!");
    await page.locator("#confirm").fill("StrongPassword123!");
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/login\?verify_email_sent=1/);
  });

  test("F1-UTC01-TC02 and TC03 show client validation errors", async ({ page }) => {
    await page.goto("/register");
    await page.locator("#name").fill("JohnDoe");
    await page.locator("#email").fill("johndoe-example");
    await page.locator("#password").fill("StrongPassword123!");
    await page.locator("#confirm").fill("StrongPassword123!");
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.locator("#email")).toHaveJSProperty("validity.valid", false);

    await page.locator("#email").fill("johndoe@example.com");
    await page.locator("#password").fill("weak");
    await page.locator("#confirm").fill("weak");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/Password must include/)).toBeVisible();
  });

  test("F1-UTC01-TC04 displays duplicate-email response", async ({ page }) => {
    await page.route(`${BACKEND_URL}/register`, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "EmailAlreadyExistsException: The email is already registered",
        }),
      });
    });

    await page.goto("/register");
    await page.locator("#name").fill("JohnDoe");
    await page.locator("#email").fill("johndoe@example.com");
    await page.locator("#password").fill("StrongPassword123!");
    await page.locator("#confirm").fill("StrongPassword123!");
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(
      page.getByText(/EmailAlreadyExistsException/).first(),
    ).toBeVisible();
  });

  test("F1-UTC02-TC01 authenticates a verified member", async ({ page }) => {
    await page.route(`${BACKEND_URL}/login`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "member-token",
          token_type: "bearer",
          requires_2fa: false,
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "user@domain.com",
            display_name: "Member",
            is_email_verified: true,
            is_2fa_enabled: false,
          },
        }),
      });
    });

    await page.goto("/login");
    await page.locator("#email").fill("user@domain.com");
    await page.locator("#password").fill("ValidPass123!");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect.poll(
      () => page.evaluate(() => localStorage.getItem("rf_token")),
    ).toBe("member-token");
    await expect(page).toHaveURL(/\/$/);
  });

  test("F1-UTC02-TC02 and TC03 display backend authentication errors", async ({ page }) => {
    let status = 401;
    let detail = "InvalidCredentialsException: Incorrect email or password";
    await page.route(`${BACKEND_URL}/login`, async (route) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ detail }),
      });
    });

    await page.goto("/login");
    await page.locator("#email").fill("user@domain.com");
    await page.locator("#password").fill("WrongPass");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(
      page.getByText(/InvalidCredentialsException/).first(),
    ).toBeVisible();

    status = 403;
    detail = "AccountNotVerifiedException: Please verify your email";
    await page.locator("#password").fill("ValidPass123!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(
      page.getByText(/AccountNotVerifiedException/).first(),
    ).toBeVisible();
  });

  test("F1-UTC04 completes the login 2FA challenge", async ({ page }) => {
    await page.route(`${BACKEND_URL}/login`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requires_2fa: true,
          temp_token: "temporary-token",
        }),
      });
    });
    await page.route("**/api/2fa/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "verified-token",
          token_type: "bearer",
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "user@domain.com",
            display_name: "Member",
            is_email_verified: true,
            is_2fa_enabled: true,
          },
        }),
      });
    });

    await page.goto("/login");
    await page.locator("#email").fill("user@domain.com");
    await page.locator("#password").fill("ValidPass123!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText("Two-Factor Authentication")).toBeVisible();
    await page.locator("input[data-input-otp]").fill("123456");

    await expect.poll(
      () => page.evaluate(() => localStorage.getItem("rf_token")),
    ).toBe("verified-token");
  });
});
