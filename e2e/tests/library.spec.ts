import { test, expect } from "@playwright/test";
import {
  connectDB,
  disconnectDB,
  deleteUserByEmail,
  verifyUserEmail,
} from "../helpers/db-helper";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `LibraryTest_${TEST_TIMESTAMP}`,
  email: `library.test+${TEST_TIMESTAMP}@reelcast.dev`,
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

test.describe("Library & Campaign Management", () => {
  
  test.beforeEach(async ({ page, request }) => {
    // 1. Create a user via API
    await request.post(`${BACKEND_URL}/register`, {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
        display_name: TEST_USER.displayName,
      }
    });
    
    // 2. Verify email
    await verifyUserEmail(TEST_USER.email);

    // 3. Login
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to authenticated area (root "/" not "/dashboard")
    await page.waitForURL(/:\d+\/?$/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  test("should be able to create a campaign and a product", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // ----- Create Campaign -----
    await page.click('button:has-text("New Campaign")');
    await expect(page.locator('text=New Campaign').first()).toBeVisible();

    const campaignName = `Summer Collection ${Date.now()}`;
    await page.fill('input#campaign-name', campaignName);
    await page.fill('textarea#campaign-desc', "Products for this summer.");

    // Intercept campaign creation
    const createCampaignPromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns") && res.request().method() === "POST"
    );

    await page.click('button:has-text("Create Campaign")');
    const campaignRes = await createCampaignPromise;
    expect(campaignRes.status()).toBe(201);

    // Wait for the campaign to appear on the grid
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Click into campaign
    await page.click(`h3:has-text("${campaignName}")`);
    
    // Validate we are inside the campaign view
    await expect(page.locator(`h1:has-text("${campaignName}")`)).toBeVisible();

    // ----- Add Product UI -----
    await page.click('button:has-text("Add Product")');
    await expect(page.locator('text=Add New Product').first()).toBeVisible();

    const productName = "Sunscreen SPF 50";
    await page.fill('input#product-name', productName);
    await page.fill('textarea#product-points', "Protects from UV, Waterproof");
    await page.fill('input#product-link', "https://example.com/buy");

    // Intercept product creation
    const createProductPromise = page.waitForResponse(
      (res) => res.url().includes("/api/products") && res.request().method() === "POST"
    );

    await page.click('button:has-text("Save Product")');
    const productRes = await createProductPromise;
    expect(productRes.status()).toBe(201); // Backend returns 201 Created

    // Wait for library to refresh and product to appear
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 10000 });
  });

  test("should be able to create and then delete a campaign", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Create a campaign
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Delete Me Campaign ${Date.now()}`;
    await page.fill('input#campaign-name', campaignName);
    await page.fill('textarea#campaign-desc', "This campaign will be deleted.");

    const createPromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns") && res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    const createRes = await createPromise;
    expect(createRes.status()).toBe(201);

    // Wait for campaign to appear
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // The campaign card is a .group div containing the h3 with the campaign name.
    // The edit button is inside the banner area with title="Edit campaign" and
    // only visible on hover (opacity-0 group-hover:opacity-100).
    // We use Playwright's force option to click the button even when hidden.
    const campaignCard = page.locator(`.group:has(h3:has-text("${campaignName}"))`);
    await campaignCard.hover();
    // Use force:true because the button has CSS opacity-0 transition
    await campaignCard.locator('button[title="Edit campaign"]').click({ force: true });

    // Verify the edit dialog opened
    await expect(page.locator('text=Edit Campaign').first()).toBeVisible();

    // Delete the campaign
    const deletePromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns/") && res.request().method() === "DELETE"
    );
    await page.click('button:has-text("Delete")');
    const deleteRes = await deletePromise;
    expect(deleteRes.status()).toBe(204);

    // Campaign should be gone
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeHidden();
  });

  test("should be able to edit a campaign", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Create a campaign first
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Edit Test ${Date.now()}`;
    await page.fill('input#campaign-name', campaignName);
    await page.fill('textarea#campaign-desc', "Original description.");

    const createPromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns") && res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createPromise;
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Open edit dialog via the edit button on the campaign card
    const campaignCard = page.locator(`.group:has(h3:has-text("${campaignName}"))`);
    await campaignCard.hover();
    await campaignCard.locator('button[title="Edit campaign"]').click({ force: true });

    // Change the name
    const updatedName = `Updated Campaign ${Date.now()}`;
    await page.fill('input#campaign-name', updatedName);

    const updatePromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns/") && res.request().method() === "PUT"
    );
    await page.click('button:has-text("Save Changes")');
    const updateRes = await updatePromise;
    expect(updateRes.status()).toBe(200);

    // Verify the updated name appears
    await expect(page.locator(`h3:has-text("${updatedName}")`)).toBeVisible();
  });

  test("should show empty state when no campaigns exist", async ({ page }) => {
    // Navigate to the library (new user has no campaigns)
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");
    await page.waitForLoadState("networkidle");

    // Verify the page header is shown
    await expect(page.locator('text=Campaigns & Products').first()).toBeVisible();

    // Verify the "New Campaign" button exists
    await expect(page.locator('button:has-text("New Campaign")')).toBeVisible();
  });

  test("campaign search filters correctly", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Create two campaigns
    const name1 = `Alpha Campaign ${Date.now()}`;
    const name2 = `Beta Campaign ${Date.now()}`;

    // Create first campaign
    await page.click('button:has-text("New Campaign")');
    await page.fill('input#campaign-name', name1);
    let createPromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns") && res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createPromise;
    await expect(page.locator(`h3:has-text("${name1}")`)).toBeVisible();

    // Create second campaign
    await page.click('button:has-text("New Campaign")');
    await page.fill('input#campaign-name', name2);
    createPromise = page.waitForResponse(
      (res) => res.url().includes("/api/campaigns") && res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createPromise;
    await expect(page.locator(`h3:has-text("${name2}")`)).toBeVisible();

    // Search for "Alpha" - should show only first campaign
    await page.fill('input[placeholder="Search campaigns…"]', "Alpha");
    await expect(page.locator(`h3:has-text("${name1}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${name2}")`)).toBeHidden();

    // Clear search - both should show
    await page.fill('input[placeholder="Search campaigns…"]', "");
    await expect(page.locator(`h3:has-text("${name1}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${name2}")`)).toBeVisible();
  });

  test("new campaign dialog requires a name", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Open dialog and try to create without a name
    await page.click('button:has-text("New Campaign")');
    await expect(page.locator('text=New Campaign').first()).toBeVisible();

    // Click Create Campaign with empty name
    await page.click('button:has-text("Create Campaign")');

    // Should show a validation toast (destructive)
    await expect(page.locator('text=Campaign name is required').first()).toBeVisible();
  });
});