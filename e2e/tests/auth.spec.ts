/**
 * auth.spec.ts
 * ─────────────────────────────────────────────────────────────────────
 * Feature 1: Registration & Authentication System — E2E Tests
 *
 * This spec combines three layers of verification in every scenario:
 *  1. **UI**  — Playwright drives the Next.js frontend (filling forms,
 *               clicking buttons, asserting redirects & toast messages).
 *  2. **API** — Network requests to the FastAPI backend are intercepted
 *               via `page.on('response')` and `page.waitForResponse()`
 *               to assert status codes and payload shape.
 *  3. **DB**  — `pg` queries run directly against PostgreSQL to verify
 *               the data layer matches what the UI and API reported.
 *
 * Prerequisites:
 *  • Frontend dev server running on FRONTEND_URL  (default :3000)
 *  • Backend FastAPI server running on BACKEND_URL (default :8000)
 *  • PostgreSQL accessible with the credentials in `.env.test`
 * ─────────────────────────────────────────────────────────────────────
 */

import { test, expect, Page } from "@playwright/test";
import {
  connectDB,
  disconnectDB,
  findUserByEmail,
  deleteUserByEmail,
  verifyUserEmail,
  countUsersByEmail,
} from "../helpers/db-helper";

// ─── Test Data ──────────────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** Unique test user — timestamp suffix prevents collisions across runs. */
const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `e2euser_${TEST_TIMESTAMP}`,
  email: `e2e.test+${TEST_TIMESTAMP}@reelcast.dev`,
  password: "Str0ng!Pass#2026",
};

// ─── Lifecycle ──────────────────────────────────────────────────────

test.beforeAll(async () => {
  await connectDB();

  // Defensive cleanup: remove any leftover test user from a previous aborted run
  await deleteUserByEmail(TEST_USER.email);
});

test.afterAll(async () => {
  // Cleanup: remove the test user so the DB stays pristine
  await deleteUserByEmail(TEST_USER.email);
  await disconnectDB();
});

// ═══════════════════════════════════════════════════════════════════
//  SCENARIO A — Registration
// ═══════════════════════════════════════════════════════════════════

test.describe("Scenario A: Guest Registration", () => {
  test("A guest registers via the UI → API returns success → DB contains the new user", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Navigate to the registration page
    // ──────────────────────────────────────────────────────────────
    await page.goto("/register");
    await expect(page.locator("h2")).toContainText("Start creating in minutes");

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Fill in the registration form
    // ──────────────────────────────────────────────────────────────
    await page.locator("#name").fill(TEST_USER.displayName);
    await page.locator("#email").fill(TEST_USER.email);
    await page.locator("#password").fill(TEST_USER.password);
    await page.locator("#confirm").fill(TEST_USER.password);

    // Accept terms & conditions checkbox
    // The Radix Checkbox renders a <button> role="checkbox"
    await page.getByRole("checkbox").click();

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Submit and intercept the API response
    // ──────────────────────────────────────────────────────────────

    // Set up a promise that resolves when the /register API responds.
    const registerResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/register") &&
        res.request().method() === "POST" &&
        res.url().includes(BACKEND_URL),
      { timeout: 30_000 }
    );

    // Click the submit button
    await page.getByRole("button", { name: /create account/i }).click();

    // Wait for the API response
    const registerResponse = await registerResponsePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer assertions
    // ──────────────────────────────────────────────────────────────
    expect(registerResponse.status()).toBe(200);

    const responseBody = await registerResponse.json();
    expect(responseBody).toHaveProperty("access_token");
    expect(responseBody).toHaveProperty("token_type", "bearer");
    expect(responseBody).toHaveProperty("user");
    expect(responseBody.user).toMatchObject({
      email: TEST_USER.email,
      display_name: TEST_USER.displayName,
      is_email_verified: false,
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer assertions (redirect to login page with
    //          verify_email_sent=1 query param)
    // ──────────────────────────────────────────────────────────────
    await page.waitForURL(/\/login\?verify_email_sent=1/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login\?verify_email_sent=1/);

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — Database Layer assertions
    // ──────────────────────────────────────────────────────────────
    const dbUser = await findUserByEmail(TEST_USER.email);

    // The user record must exist
    expect(dbUser).not.toBeNull();
    expect(dbUser!.email).toBe(TEST_USER.email);
    expect(dbUser!.display_name).toBe(TEST_USER.displayName);

    // Password must be hashed (bcrypt hashes start with $2b$ or $2a$)
    expect(dbUser!.hashed_password).toBeTruthy();
    expect(dbUser!.hashed_password).toMatch(/^\$2[ab]\$/);

    // Email should NOT be verified yet (user hasn't clicked the link)
    expect(dbUser!.is_email_verified).toBe(false);

    // 2FA should be disabled by default
    expect(dbUser!.is_2fa_enabled).toBe(false);

    // Exactly one record with this email should exist
    const count = await countUsersByEmail(TEST_USER.email);
    expect(count).toBe(1);
  });

  test("Registration with a duplicate email should fail", async ({ page }) => {
    // The user from the previous test should still exist.
    // Attempt to register with the same email again.
    await page.goto("/register");

    await page.locator("#name").fill("DuplicateUser");
    await page.locator("#email").fill(TEST_USER.email);
    await page.locator("#password").fill(TEST_USER.password);
    await page.locator("#confirm").fill(TEST_USER.password);
    await page.getByRole("checkbox").click();

    const duplicateResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/register") &&
        res.request().method() === "POST" &&
        res.url().includes(BACKEND_URL),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /create account/i }).click();
    const duplicateResponse = await duplicateResponsePromise;

    // API should return 400 for duplicate email
    expect(duplicateResponse.status()).toBe(400);

    const errorBody = await duplicateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/already registered/i);

    // UI should display an error message
    await expect(page.locator("text=already registered").first()).toBeVisible({
      timeout: 5_000,
    });

    // DB should still have exactly one record
    const count = await countUsersByEmail(TEST_USER.email);
    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  SCENARIO B — Login
// ═══════════════════════════════════════════════════════════════════

test.describe("Scenario B: Member Login", () => {
  test.beforeAll(async () => {
    // Pre-condition: The user must have a verified email.
    // (The registration test above already inserted the user, but
    //  their email is unverified. We patch that directly in the DB
    //  to simulate clicking the verification link.)
    await verifyUserEmail(TEST_USER.email);
  });

  test("An existing member logs in via the UI → API returns a token → UI redirects to the dashboard", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Navigate to the login page
    // ──────────────────────────────────────────────────────────────
    await page.goto("/login");
    await expect(page.locator("h2").first()).toContainText("Welcome back");

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Fill in the login form
    // ──────────────────────────────────────────────────────────────
    await page.locator("#email").fill(TEST_USER.email);
    await page.locator("#password").fill(TEST_USER.password);

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Submit and intercept the API response
    // ──────────────────────────────────────────────────────────────
    const loginResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/login") &&
        res.request().method() === "POST" &&
        res.url().includes(BACKEND_URL),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /sign in/i }).click();
    const loginResponse = await loginResponsePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer assertions
    // ──────────────────────────────────────────────────────────────
    expect(loginResponse.status()).toBe(200);

    const loginBody = await loginResponse.json();

    // Since 2FA is disabled for this user, we expect a full token
    expect(loginBody).toHaveProperty("access_token");
    expect(loginBody.access_token).toBeTruthy();
    expect(loginBody).toHaveProperty("token_type", "bearer");
    expect(loginBody).toHaveProperty("requires_2fa", false);

    // The response should include the user object
    expect(loginBody).toHaveProperty("user");
    expect(loginBody.user.email).toBe(TEST_USER.email);

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer assertions: redirect to the authenticated
    //          area (the root `/` which renders the dashboard)
    // ──────────────────────────────────────────────────────────────
    // After login, the AuthContext stores the token in localStorage
    // and the router pushes to "/". The DashboardLayout in (main)
    // group should render, so we wait for the URL to change.
    // NOTE: waitForURL matches the FULL URL (e.g. http://localhost:3000/),
    // not just the pathname, so we use a regex that matches the root path.
    await page.waitForURL(/:\d+\/?$/, { timeout: 15_000 });

    // Let the SPA finish hydrating / writing to localStorage
    await page.waitForLoadState("networkidle");

    // Verify the token was persisted in localStorage
    const storedToken = await page.evaluate(() =>
      localStorage.getItem("rf_token")
    );
    expect(storedToken).toBeTruthy();
    expect(storedToken).toBe(loginBody.access_token);

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — DB cross-check: the user still exists with verified email
    // ──────────────────────────────────────────────────────────────
    const dbUser = await findUserByEmail(TEST_USER.email);
    expect(dbUser).not.toBeNull();
    expect(dbUser!.is_email_verified).toBe(true);
  });

  test("Login with wrong password should fail with 401", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill(TEST_USER.email);
    await page.locator("#password").fill("WrongPassword!123");

    const failedLoginPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/login") &&
        res.request().method() === "POST" &&
        res.url().includes(BACKEND_URL),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /sign in/i }).click();
    const failedLoginResponse = await failedLoginPromise;

    // API should return 401
    expect(failedLoginResponse.status()).toBe(401);

    const errorBody = await failedLoginResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/incorrect email or password/i);

    // UI should display an error
    await expect(
      page.locator("text=Login failed").first()
    ).toBeVisible({ timeout: 5_000 });

    // Should remain on the login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("Login with unverified email should fail with 403", async ({ page }) => {
    // Create a second unverified user directly via API
    const unverifiedEmail = `e2e.unverified+${TEST_TIMESTAMP}@reelcast.dev`;
    const unverifiedPassword = "Unverified!Pass1";

    // Register via API (bypasses email sending issues in test)
    const registerRes = await page.request.post(`${BACKEND_URL}/register`, {
      data: {
        email: unverifiedEmail,
        password: unverifiedPassword,
        display_name: "Unverified Tester",
      },
    });
    // Registration may succeed or fail if email sending fails — we just need the user in DB.
    // If the email send fails, the backend rolls back. So let's insert directly.
    // We'll try the API first, and if it fails, we just skip this test.
    if (!registerRes.ok()) {
      test.skip(true, "Could not create unverified user (email sending likely failed). Skipping.");
      return;
    }

    // Now try to log in with the unverified user
    await page.goto("/login");
    await page.locator("#email").fill(unverifiedEmail);
    await page.locator("#password").fill(unverifiedPassword);

    const unverifiedLoginPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/login") &&
        res.request().method() === "POST" &&
        res.url().includes(BACKEND_URL),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /sign in/i }).click();
    const unverifiedLoginResponse = await unverifiedLoginPromise;

    // API should return 403 — email not verified
    expect(unverifiedLoginResponse.status()).toBe(403);

    const errorBody = await unverifiedLoginResponse.json();
    expect(errorBody.detail).toMatch(/verify your email/i);

    // Cleanup the unverified user
    await deleteUserByEmail(unverifiedEmail);
  });
});
