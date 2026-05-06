import { test, expect } from "@playwright/test";
import {
  connectDB,
  disconnectDB,
  findUserByEmail,
  deleteUserByEmail,
  verifyUserEmail,
} from "../helpers/db-helper";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `AccountTest_${TEST_TIMESTAMP}`,
  email: `account.test+${TEST_TIMESTAMP}@reelcast.dev`,
  password: "Str0ng!Pass#2026",
};

test.beforeAll(async () => {
  await connectDB();
  await deleteUserByEmail(TEST_USER.email);
});

test.afterAll(async () => {
  await deleteUserByEmail(TEST_USER.email);
  await disconnectDB();
});

test.describe("Account Management", () => {
  // Pre-requisite: Create a user and login directly before running account tests
  test.beforeEach(async ({ page, request }) => {
    // 1. Create a user via API to speed up test
    const registerRes = await request.post(`${BACKEND_URL}/register`, {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
        display_name: TEST_USER.displayName,
      }
    });

    // Ignore 400 if user exists somehow
    if (registerRes.status() !== 400) {
      expect(registerRes.ok()).toBeTruthy();
    }

    // 2. Verify their email via DB
    await verifyUserEmail(TEST_USER.email);

    // 3. Login via UI to establish session
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to authenticated area (root "/" or "/dashboard")
    // The login page redirects to "/" via router.replace("/")
    await page.waitForURL(/:\d+\/?$/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  test("can update display name", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // ----- UI Layer -----

    // Update display name
    const newDisplayName = `UpdatedName_${Date.now()}`;
    const nameInput = page.locator('input#name');
    await nameInput.waitFor({ state: "visible" });
    await nameInput.fill(newDisplayName);

    // ----- Network / API Layer -----
    // Intercept the PUT /me route
    const updatePromise = page.waitForResponse(
      (res) => res.url().includes("/me") && res.request().method() === "PUT"
    );

    // Save
    await page.click('button:has-text("Save")');
    const updateRes = await updatePromise;
    expect(updateRes.status()).toBe(200);

    // Assert Toast
    await expect(page.locator('text=Profile saved successfully')).toBeVisible();

    // ----- Database Layer -----
    const dbUser = await findUserByEmail(TEST_USER.email);
    expect(dbUser).not.toBeNull();
    expect(dbUser?.display_name).toBe(newDisplayName);
  });

  test("display name persists after page refresh", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    const newDisplayName = `Persist_${Date.now()}`;
    const nameInput = page.locator('input#name');
    await nameInput.waitFor({ state: "visible" });
    await nameInput.fill(newDisplayName);

    // Save and wait for API response
    const updatePromise = page.waitForResponse(
      (res) => res.url().includes("/me") && res.request().method() === "PUT"
    );
    await page.click('button:has-text("Save")');
    await updatePromise;
    await expect(page.locator('text=Profile saved successfully')).toBeVisible();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // The input should still contain the new display name
    const refreshedInput = page.locator('input#name');
    await refreshedInput.waitFor({ state: "visible" });
    await expect(refreshedInput).toHaveValue(newDisplayName);
  });

  test("profile card shows correct user info", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // Verify the user display name is shown
    await expect(page.locator(`text=${TEST_USER.displayName}`).first()).toBeVisible();

    // Verify the user email is shown
    await expect(page.locator(`text=${TEST_USER.email}`).first()).toBeVisible();

    // Verify the "Joined" date is shown
    await expect(page.locator('text=Joined').first()).toBeVisible();
  });

  test("email field is read-only", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // The email input should be disabled
    const emailInput = page.locator('input#acc-email');
    await emailInput.waitFor({ state: "visible" });
    await expect(emailInput).toBeDisabled();
  });

  test("can sign out from account page", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // Click Sign Out button
    await page.click('button:has-text("Sign Out")');

    // Should redirect to login page
    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);

    // Token should be cleared from localStorage
    const storedToken = await page.evaluate(() =>
      localStorage.getItem("rf_token")
    );
    expect(storedToken).toBeFalsy();
  });

  test("change password button opens dialog", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // Click the "Change Password" button
    await page.click('button:has-text("Change Password")');

    // The dialog should open with the title
    await expect(page.locator('text=Change Password').first()).toBeVisible();

    // Verify the dialog has the required fields
    await expect(page.locator('text=Current Password').first()).toBeVisible();
    await expect(page.locator('text=New Password').first()).toBeVisible();
    await expect(page.locator('text=Confirm New Password').first()).toBeVisible();
  });

  test("change password with wrong current password should fail", async ({ page }) => {
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    // Open change password dialog
    await page.click('button:has-text("Change Password")');
    await expect(page.locator('text=Current Password').first()).toBeVisible();

    // Fill in the form with wrong current password
    const currentPwInput = page.locator('input[placeholder="Enter current password"]');
    const newPwInput = page.locator('input[placeholder="Enter new password"]');
    const confirmPwInput = page.locator('input[placeholder="Confirm new password"]');

    await currentPwInput.fill("WrongPassword!123");
    await newPwInput.fill("NewStr0ng!Pass#2026");
    await confirmPwInput.fill("NewStr0ng!Pass#2026");

    // Intercept the change password API call
    const changePwPromise = page.waitForResponse(
      (res) => res.url().includes("/api/change-password") && res.request().method() === "POST"
    );

    // Click submit
    await page.locator('div[role="dialog"] button:has-text("Change Password")').click();
    const changePwRes = await changePwPromise;

    // Should fail with 401
    expect(changePwRes.status()).toBe(401);
  });

  // test("can toggle social integration switches", async ({ page }) => {
  //   await page.goto("/account");

  //   // Find the toggle for Instagram (which is initially disabled in the NextJS hardcoded state)
  //   // The exact implementation toggles SVG paths or classes, but we can search by the button interacting
  //   const instaToggle = page.locator('div:has-text("Instagram") + button');

  //   // Wait for the toggle to be visible
  //   await instaToggle.waitFor({ state: 'visible' });

  //   // Click toggle
  //   await instaToggle.click();

  //   // Assert toast
  //   await expect(page.locator('text=Instagram activated')).toBeVisible();
  // });
});
