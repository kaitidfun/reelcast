import { test, expect } from "@playwright/test";
import {
  connectDB,
  disconnectDB,
  deleteUserByEmail,
  verifyUserEmail,
} from "../../helpers/db-helper";

// ─── Constants ──────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `LibraryTest_${TEST_TIMESTAMP}`,
  email: `library.test+${TEST_TIMESTAMP}@reelcast.dev`,
  password: "Str0ng!Pass#2026",
};

// ─── Global DB lifecycle ────────────────────────────────────────────
test.beforeAll(async () => {
  await connectDB();
  await deleteUserByEmail(TEST_USER.email);
});

test.afterAll(async () => {
  await deleteUserByEmail(TEST_USER.email);
  await disconnectDB();
});

// ═════════════════════════════════════════════════════════════════════
// Helper: Register → verify → login → land on authenticated root
// ═════════════════════════════════════════════════════════════════════
async function registerAndLogin(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext
) {
  // 1. Register user via API
  await request.post(`${BACKEND_URL}/register`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      display_name: TEST_USER.displayName,
    },
  });

  // 2. Verify email directly in DB
  await verifyUserEmail(TEST_USER.email);

  // 3. Login via UI
  await page.goto("/login");
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');

  // 4. Wait for redirect to authenticated root
  await page.waitForURL(/:\d+\/?$/, { timeout: 15000 });

  // 5. Wait for network to settle
  await page.waitForLoadState("networkidle");
}

// ═════════════════════════════════════════════════════════════════════
// Helper: Navigate to /library page
// ═════════════════════════════════════════════════════════════════════
async function navigateToLibrary(page: import("@playwright/test").Page) {
  await page.click('a[href="/library"]');
  await page.waitForURL("**/library");
  await page.waitForLoadState("networkidle");
}

// ═════════════════════════════════════════════════════════════════════
// F4-UTC01: Test to create Campaign
// ═════════════════════════════════════════════════════════════════════
test.describe("F4-UTC01 – Campaign Creation", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerAndLogin(page, request);
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  // ── TC01: Successful campaign creation ────────────────────────────
  test("TC01 – Successful campaign creation", async ({ page }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // Open the "New Campaign" dialog
    await page.click('button:has-text("New Campaign")');
    await expect(page.locator("text=New Campaign").first()).toBeVisible();

    // Fill in campaign details
    const campaignName = `Summer 2026 ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", "Promo");

    // Intercept POST /api/campaigns and click "Create Campaign"
    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');

    // Assert the API returned 201 Created
    const campaignRes = await createCampaignPromise;
    expect(campaignRes.status()).toBe(201);

    // Verify the response body contains campaign_id and name
    const campaignBody = await campaignRes.json();
    expect(campaignBody).toHaveProperty("campaign_id");
    expect(campaignBody.name).toBe(campaignName);

    // Verify the campaign appears in the grid
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();
  });

  // ── TC02: Duplicate campaign name (409 Conflict) ──────────────────
  test("TC02 – Duplicate campaign name returns DuplicateCampaignNameException", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // First, create a campaign successfully so the name exists
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Summer 2026 Dup ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", "First creation");

    const firstCreatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    const firstRes = await firstCreatePromise;
    expect(firstRes.status()).toBe(201);
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Mock POST /api/campaigns → 409 to simulate duplicate name
    await page.route("**/api/campaigns", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "DuplicateCampaignNameException: A campaign with this name already exists",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Attempt to create another campaign with the same name
    await page.click('button:has-text("New Campaign")');
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", "Duplicate attempt");
    await page.click('button:has-text("Create Campaign")');

    // Assert error is shown in the UI
    await expect(
      page.locator("text=A campaign with this name already exists").first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── TC03: Database failure (500 Internal Server Error) ────────────
  test("TC03 – Database failure returns DatabaseInsertException", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // Mock POST /api/campaigns → 500 to simulate DB failure
    await page.route("**/api/campaigns", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "DatabaseInsertException: Failed to save campaign",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Try to create a campaign
    await page.click('button:has-text("New Campaign")');
    await page.fill("input#campaign-name", `DB Fail Campaign ${Date.now()}`);
    await page.fill("textarea#campaign-desc", "Should fail");
    await page.click('button:has-text("Create Campaign")');

    // Assert error is shown in the UI
    await expect(
      page.locator("text=Failed to save campaign").first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════════════════
// F4-UTC02: Test to validate adding a new product entry
// ═════════════════════════════════════════════════════════════════════
test.describe("F4-UTC02 – Product Creation", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerAndLogin(page, request);
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  // ── TC01: Successful product creation with complete data ──────────
  test("TC01 – Successful product creation with valid data", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // --- Create a campaign first (prerequisite) ---
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Product Test Campaign ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", "Host campaign for product");

    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    const campaignRes = await createCampaignPromise;
    expect(campaignRes.status()).toBe(201);
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // --- Click into the campaign ---
    await page.click(`h3:has-text("${campaignName}")`);
    await expect(page.locator(`h1:has-text("${campaignName}")`)).toBeVisible();

    // --- Add a product ---
    await page.click('button:has-text("Add Product")');
    await expect(page.locator("text=Add New Product").first()).toBeVisible();

    const productName = "Cold Brew Kit";
    await page.fill("input#product-name", productName);
    await page.fill(
      "textarea#product-points",
      "Premium cold brew coffee maker kit"
    );
    await page.fill("input#product-link", "https://example.com/cold-brew");

    // Intercept POST /api/products
    const createProductPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/products") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Save Product")');

    // Assert 201 Created
    const productRes = await createProductPromise;
    expect(productRes.status()).toBe(201);

    // Verify response body contains product_id
    const productBody = await productRes.json();
    expect(productBody).toHaveProperty("product_id");
    expect(productBody.product_name).toBe(productName);

    // Verify the product appears in the UI
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator(`text=${productName}`).first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── TC02: Invalid campaign ID (404 Not Found) ────────────────────
  test("TC02 – Invalid campaign ID returns CampaignNotFoundException", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // Create a campaign so we have something to click into
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Invalid CID Test ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);

    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createCampaignPromise;
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Drill into the campaign
    await page.click(`h3:has-text("${campaignName}")`);
    await expect(page.locator(`h1:has-text("${campaignName}")`)).toBeVisible();

    // Mock POST /api/products → 404 (campaign not found)
    await page.route("**/api/products", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "CampaignNotFoundException: Campaign not found",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Attempt to add a product
    await page.click('button:has-text("Add Product")');
    await page.fill("input#product-name", "Cold Brew Kit");
    await page.fill("textarea#product-points", "Some points");
    await page.fill("input#product-link", "https://example.com");
    await page.click('button:has-text("Save Product")');

    // Assert the error is shown
    await expect(
      page.locator("text=Campaign not found").first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── TC03: More than 5 product images (400 Bad Request) ────────────
  test("TC03 – More than 5 images returns MaxImagesExceededException", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // Create a campaign prerequisite
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Max Images Test ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);

    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createCampaignPromise;
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Drill into the campaign
    await page.click(`h3:has-text("${campaignName}")`);
    await expect(page.locator(`h1:has-text("${campaignName}")`)).toBeVisible();

    // Mock POST /api/products → 400 (too many images)
    await page.route("**/api/products", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "MaxImagesExceededException: Maximum 5 images allowed per product",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Attempt to add a product
    await page.click('button:has-text("Add Product")');
    await page.fill("input#product-name", "Cold Brew Kit");
    await page.fill("textarea#product-points", "Some selling points");
    await page.fill("input#product-link", "https://example.com");
    await page.click('button:has-text("Save Product")');

    // Assert the error is shown
    await expect(
      page.locator("text=Maximum 5 images allowed per product").first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── TC04: Unsupported image format / PDF (400 Bad Request) ────────
  test("TC04 – Unsupported image format returns InvalidImageFormatException", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // Create a campaign prerequisite
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Invalid Format Test ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);

    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createCampaignPromise;
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Drill into the campaign
    await page.click(`h3:has-text("${campaignName}")`);
    await expect(page.locator(`h1:has-text("${campaignName}")`)).toBeVisible();

    // Mock POST /api/products → 400 (invalid image format)
    await page.route("**/api/products", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "InvalidImageFormatException: Unsupported image format. Allowed: JPG, PNG, WEBP",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Attempt to add a product
    await page.click('button:has-text("Add Product")');
    await page.fill("input#product-name", "Cold Brew Kit");
    await page.fill("textarea#product-points", "Some selling points");
    await page.fill("input#product-link", "https://example.com");
    await page.click('button:has-text("Save Product")');

    // Assert the error is shown
    await expect(
      page
        .locator("text=Unsupported image format. Allowed: JPG, PNG, WEBP")
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════════════════
// Supplementary: Library Management tests (kept from existing spec)
// ═════════════════════════════════════════════════════════════════════
test.describe("Library Management", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerAndLogin(page, request);
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  // ── Create and then delete a campaign ─────────────────────────────
  test("should be able to create and then delete a campaign", async ({
    page,
  }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Create a campaign
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Delete Me Campaign ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", "This campaign will be deleted.");

    const createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    const createRes = await createPromise;
    expect(createRes.status()).toBe(201);

    // Wait for campaign to appear
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Switch to list view where the edit button is accessible
    await page.click('button[aria-label="List view"]');
    await page.waitForTimeout(300);

    // Hover the campaign row and click edit
    const campaignRow = page.locator(`.group:has-text("${campaignName}")`);
    await campaignRow.hover();
    await campaignRow
      .locator('button[title="Edit campaign"]')
      .click({ force: true });

    // Verify the edit dialog opened
    await expect(page.locator("text=Edit Campaign").first()).toBeVisible();

    // Delete the campaign
    const deletePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns/") &&
        res.request().method() === "DELETE"
    );
    await page.click('button:has-text("Delete")');
    const deleteRes = await deletePromise;
    expect(deleteRes.status()).toBe(204);

    // Campaign should be gone
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeHidden();
  });

  // ── Edit a campaign ───────────────────────────────────────────────
  test("should be able to edit a campaign", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Create a campaign first
    await page.click('button:has-text("New Campaign")');
    const campaignName = `Edit Test ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", "Original description.");

    const createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createPromise;
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // Switch to list view where the edit button is accessible
    await page.click('button[aria-label="List view"]');
    await page.waitForTimeout(300);

    // Hover the campaign row and click edit
    const campaignRow = page.locator(`.group:has-text("${campaignName}")`);
    await campaignRow.hover();
    await campaignRow
      .locator('button[title="Edit campaign"]')
      .click({ force: true });

    // Change the name
    const updatedName = `Updated Campaign ${Date.now()}`;
    await page.fill("input#campaign-name", updatedName);

    const updatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns/") &&
        res.request().method() === "PUT"
    );
    await page.click('button:has-text("Save Changes")');
    const updateRes = await updatePromise;
    expect(updateRes.status()).toBe(200);

    // Verify the updated name appears
    await expect(page.locator(`h3:has-text("${updatedName}")`)).toBeVisible();
  });

  // ── Empty state when no campaigns exist ───────────────────────────
  test("should show empty state when no campaigns exist", async ({ page }) => {
    // Navigate to the library (new user has no campaigns)
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");
    await page.waitForLoadState("networkidle");

    // Verify the page header is shown
    await expect(
      page.locator("text=Campaigns & Products").first()
    ).toBeVisible();

    // Verify the "New Campaign" button exists
    await expect(
      page.locator('button:has-text("New Campaign")')
    ).toBeVisible();
  });

  // ── Campaign search filters correctly ─────────────────────────────
  test("campaign search filters correctly", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Create two campaigns
    const name1 = `Alpha Campaign ${Date.now()}`;
    const name2 = `Beta Campaign ${Date.now()}`;

    // Create first campaign
    await page.click('button:has-text("New Campaign")');
    await page.fill("input#campaign-name", name1);
    let createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    await createPromise;
    await expect(page.locator(`h3:has-text("${name1}")`)).toBeVisible();

    // Create second campaign
    await page.click('button:has-text("New Campaign")');
    await page.fill("input#campaign-name", name2);
    createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
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

  // ── New campaign dialog requires a name ───────────────────────────
  test("new campaign dialog requires a name", async ({ page }) => {
    // Navigate to the library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");

    // Open dialog and try to create without a name
    await page.click('button:has-text("New Campaign")');
    await expect(page.locator("text=New Campaign").first()).toBeVisible();

    // Click Create Campaign with empty name
    await page.click('button:has-text("Create Campaign")');

    // Should show a validation toast (destructive)
    await expect(
      page.locator("text=Campaign name is required").first()
    ).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════
// F4-UTC03: Test to browse Campaign and Product Library
//
// Test Method: browseLibrary
// Description: Retrieves, filters, and sorts campaigns and associated
//   products for the authenticated member to display on the Library
//   dashboard. Supports search queries, sorting options, and view toggles.
// Prerequisite data: Authenticated member account
// Input: String (searchKeyword), Enum (sortOption, viewMode, statusFilter)
// Output: Object (List of campaigns and products, or empty state message)
// ═════════════════════════════════════════════════════════════════════
test.describe("F4-UTC03 – Browse Campaign and Product Library", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerAndLogin(page, request);
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  // ── TC01: Successful retrieval with valid search and sort parameters ──
  test("TC01 – Successful retrieval of campaigns and products with valid search and sort parameters", async ({
    page,
  }) => {
    // Navigate to the library page
    await navigateToLibrary(page);

    // --- Create prerequisite campaigns and a product ---
    // Create first campaign: "Cold Brew Summer"
    await page.click('button:has-text("New Campaign")');
    const campaignName1 = `Cold Brew Summer ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName1);
    await page.fill("textarea#campaign-desc", "Summer cold brew promo");

    let createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    let createRes = await createPromise;
    expect(createRes.status()).toBe(201);
    await expect(page.locator(`h3:has-text("${campaignName1}")`)).toBeVisible();

    // Create second campaign: "Winter Hot Cocoa"
    await page.click('button:has-text("New Campaign")');
    const campaignName2 = `Winter Hot Cocoa ${Date.now()}`;
    await page.fill("input#campaign-name", campaignName2);
    await page.fill("textarea#campaign-desc", "Winter cocoa promo");

    createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    createRes = await createPromise;
    expect(createRes.status()).toBe(201);
    await expect(page.locator(`h3:has-text("${campaignName2}")`)).toBeVisible();

    // --- Test search filtering (F4-UTC03-TD01: keyword = "Cold Brew") ---
    const searchInput = page.locator('input[placeholder="Search campaigns…"]');
    await searchInput.fill("Cold Brew");

    // Only the matching campaign should be visible
    await expect(page.locator(`h3:has-text("${campaignName1}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${campaignName2}")`)).toBeHidden();

    // --- Test view toggle (F4-UTC03-TD02: viewMode = "Grid" / "List") ---
    // Switch to list view
    await searchInput.fill(""); // Clear search first
    const listViewButton = page.locator('button[aria-label="List view"]');
    await listViewButton.click();
    await page.waitForTimeout(300);

    // Both campaigns should be visible in list view
    await expect(page.locator(`text=${campaignName1}`).first()).toBeVisible();
    await expect(page.locator(`text=${campaignName2}`).first()).toBeVisible();

    // Switch back to grid view
    const gridViewButton = page.locator('button[aria-label="Grid view"]');
    await gridViewButton.click();
    await page.waitForTimeout(300);

    // Both campaigns should still be visible in grid view
    await expect(page.locator(`h3:has-text("${campaignName1}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${campaignName2}")`)).toBeVisible();
  });

  // ── TC02: Empty state when no campaigns exist ────────────────────────
  test("TC02 – Empty state when authenticated member has no campaigns", async ({
    page,
  }) => {
    // Navigate to the library (fresh user has no campaigns)
    await navigateToLibrary(page);

    // Verify the page header is shown
    await expect(
      page.locator("text=Campaigns & Products").first()
    ).toBeVisible();

    // Verify the "New Campaign" button is available (empty state prompt)
    await expect(
      page.locator('button:has-text("New Campaign")')
    ).toBeVisible();

    // Verify no campaign cards are present (empty state)
    const campaignCards = page.locator("h3").filter({ hasText: /Campaign/ });
    await expect(campaignCards).toHaveCount(0);
  });

  // ── TC03: Database failure returns DatabaseRetrieveException ─────────
  test("TC03 – Database failure returns DatabaseRetrieveException", async ({
    page,
  }) => {
    // Mock GET /api/campaigns → 500 to simulate a database query error
    await page.route("**/api/campaigns", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "DatabaseRetrieveException: Failed to retrieve campaigns from database",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to the library page — the GET request will be intercepted
    await navigateToLibrary(page);

    // Assert the error is shown in the UI
    await expect(
      page.locator("text=/Failed to retrieve|error|something went wrong/i").first()
    ).toBeVisible({ timeout: 10000 });
  });
});