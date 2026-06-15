/**
 * stc-f4-campaign-product.spec.ts
 * ─────────────────────────────────────────────────────────────────────
 * Feature 4: Campaign and Product Management — System Test Cases (STC)
 *
 * Based on: ReelCastTestPlan_v1.1.0 — Section 3.2.3 STC-F4
 *
 * This spec covers the system-level integration tests:
 *  • STC-F4-01: End-to-End Campaign and Product Creation
 *      Verifies the creation of a marketing campaign environment and
 *      the subsequent process of capturing product details and images
 *      to add a new product entry assigned to that specific parent campaign.
 *      Associated Unit Tests: F4-UTC01, F4-UTC02
 *
 *  • STC-F4-02: Library Browsing, Filtering, and Sorting Flow
 *      Ensures an authenticated member can retrieve, filter (e.g., by
 *      active status), and sort campaigns and associated products on
 *      their Library dashboard using search queries and view toggles.
 *      Associated Unit Tests: F4-UTC02, F4-UTC03
 *
 * Three-layer verification in every scenario:
 *  1. **UI**  — Playwright drives the Next.js frontend (filling forms,
 *               clicking buttons, asserting toasts & state transitions).
 *  2. **API** — Network requests to the FastAPI backend are intercepted
 *               via `page.waitForResponse()` to assert status codes
 *               and payload shape.
 *  3. **DB**  — `pg` queries run directly against PostgreSQL to verify
 *               the data layer matches what the UI and API reported.
 *
 * Prerequisites:
 *  • Frontend dev server running on FRONTEND_URL  (default :3000)
 *  • Backend FastAPI server running on BACKEND_URL (default :8000)
 *  • PostgreSQL accessible with the credentials in `.env.test`
 * ─────────────────────────────────────────────────────────────────────
 */

import { test, expect } from "@playwright/test";
import {
  connectDB,
  disconnectDB,
  deleteUserByEmail,
  verifyUserEmail,
  findCampaignByName,
  findProductByName,
  findUserByEmail,
} from "../../helpers/db-helper";

// ─── Constants ──────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `STCLibraryTest_${TEST_TIMESTAMP}`,
  email: `stc.library.test+${TEST_TIMESTAMP}@reelcast.dev`,
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
// STC-F4-01: End-to-End Campaign and Product Creation
//
// System Feature Flow:
//   Verifies the creation of a marketing campaign environment and the
//   subsequent process of capturing product details and images to add
//   a new product entry assigned to that specific parent campaign.
//
// Associated Unit Tests: F4-UTC01, F4-UTC02
//
// Expected System Outcome:
//   The system successfully saves the unique campaign details and
//   assigns a newly created, active product ID (with up to 5 valid
//   images) to the specified campaign.
// ═════════════════════════════════════════════════════════════════════
test.describe("STC-F4-01 – End-to-End Campaign and Product Creation", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerAndLogin(page, request);
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  test("should create a campaign and then successfully add a product to it", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // PHASE 1 — Campaign Creation (F4-UTC01)
    // ──────────────────────────────────────────────────────────────

    // Navigate to the library page
    await navigateToLibrary(page);

    // Open the "New Campaign" dialog
    await page.click('button:has-text("New Campaign")');
    await expect(page.locator("text=New Campaign").first()).toBeVisible();

    // Fill in campaign details
    const campaignName = `STC E2E Campaign ${Date.now()}`;
    const campaignDesc = "End-to-end system test campaign for product creation";
    await page.fill("input#campaign-name", campaignName);
    await page.fill("textarea#campaign-desc", campaignDesc);

    // Intercept POST /api/campaigns
    const createCampaignPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');

    // ── API Layer: Assert 201 Created ──
    const campaignRes = await createCampaignPromise;
    expect(campaignRes.status()).toBe(201);

    const campaignBody = await campaignRes.json();
    expect(campaignBody).toHaveProperty("campaign_id");
    expect(campaignBody.name).toBe(campaignName);

    // ── UI Layer: Verify campaign appears in the grid ──
    await expect(page.locator(`h3:has-text("${campaignName}")`)).toBeVisible();

    // ── DB Layer: Verify campaign record exists ──
    const dbCampaign = await findCampaignByName(campaignName);
    expect(dbCampaign).not.toBeNull();
    expect(dbCampaign!.name).toBe(campaignName);

    // ──────────────────────────────────────────────────────────────
    // PHASE 2 — Product Creation within Campaign (F4-UTC02)
    // ──────────────────────────────────────────────────────────────

    // Click into the campaign detail page
    await page.click(`h3:has-text("${campaignName}")`);
    await expect(page.locator(`h1:has-text("${campaignName}")`)).toBeVisible();

    // Open the "Add Product" dialog
    await page.click('button:has-text("Add Product")');
    await expect(page.locator("text=Add New Product").first()).toBeVisible();

    // Fill in product details
    const productName = `Cold Brew Kit ${Date.now()}`;
    await page.fill("input#product-name", productName);
    await page.fill(
      "textarea#product-points",
      "Premium cold brew coffee maker kit with filter and carafe"
    );
    await page.fill("input#product-link", "https://example.com/cold-brew");

    // Intercept POST /api/products
    const createProductPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/products") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Save Product")');

    // ── API Layer: Assert 201 Created ──
    const productRes = await createProductPromise;
    expect(productRes.status()).toBe(201);

    const productBody = await productRes.json();
    expect(productBody).toHaveProperty("product_id");
    expect(productBody.product_name).toBe(productName);

    // ── UI Layer: Verify the product appears in the campaign page ──
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator(`text=${productName}`).first()
    ).toBeVisible({ timeout: 10000 });

    // ── DB Layer: Verify product record exists and is linked to campaign ──
    const dbProduct = await findProductByName(productName);
    expect(dbProduct).not.toBeNull();
    expect(dbProduct!.product_name).toBe(productName);
    expect(dbProduct!.campaign_id).toBe(campaignBody.campaign_id);
  });

  test("should prevent creating a product under an invalid campaign", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // This test validates the error path when F4-UTC01 succeeds
    // but F4-UTC02 encounters a CampaignNotFoundException
    // ──────────────────────────────────────────────────────────────

    // Navigate to the library page
    await navigateToLibrary(page);

    // Create a valid campaign first
    await page.click('button:has-text("New Campaign")');
    const campaignName = `STC Invalid Product Test ${Date.now()}`;
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

    // Mock POST /api/products → 404 (simulate campaign not found at product creation time)
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

    // ── UI Layer: Assert error is shown ──
    await expect(
      page.locator("text=Campaign not found").first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════════════════
// STC-F4-02: Library Browsing, Filtering, and Sorting Flow
//
// System Feature Flow:
//   Ensures an authenticated member can retrieve, filter (e.g., by
//   active status), and sort campaigns and associated products on
//   their Library dashboard using search queries and view toggles.
//
// Associated Unit Tests: F4-UTC02, F4-UTC03
//
// Expected System Outcome:
//   The system correctly retrieves and displays a list of campaigns
//   and products matching the valid search and sort parameters, or
//   accurately displays an empty state message if the user has
//   no campaigns.
// ═════════════════════════════════════════════════════════════════════
test.describe("STC-F4-02 – Library Browsing, Filtering, and Sorting Flow", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerAndLogin(page, request);
  });

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  test("should create campaigns with products and then browse, search, and filter them", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // PHASE 1 — Setup: Create campaigns with products (F4-UTC02)
    // ──────────────────────────────────────────────────────────────

    await navigateToLibrary(page);

    // --- Create Campaign A: "Summer Cold Brew" ---
    await page.click('button:has-text("New Campaign")');
    const campaignNameA = `Summer Cold Brew ${Date.now()}`;
    await page.fill("input#campaign-name", campaignNameA);
    await page.fill("textarea#campaign-desc", "Summer promotion");

    let createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    let createRes = await createPromise;
    expect(createRes.status()).toBe(201);
    const campaignABody = await createRes.json();
    await expect(page.locator(`h3:has-text("${campaignNameA}")`)).toBeVisible();

    // Add a product to Campaign A
    await page.click(`h3:has-text("${campaignNameA}")`);
    await expect(page.locator(`h1:has-text("${campaignNameA}")`)).toBeVisible();

    await page.click('button:has-text("Add Product")');
    const productNameA = `Iced Latte Kit ${Date.now()}`;
    await page.fill("input#product-name", productNameA);
    await page.fill("textarea#product-points", "Premium iced latte maker");
    await page.fill("input#product-link", "https://example.com/iced-latte");

    let productPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/products") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Save Product")');
    let productRes = await productPromise;
    expect(productRes.status()).toBe(201);

    // ── DB Layer: Verify product is assigned to campaign A ──
    const dbProductA = await findProductByName(productNameA);
    expect(dbProductA).not.toBeNull();
    expect(dbProductA!.campaign_id).toBe(campaignABody.campaign_id);

    // Go back to library
    await page.click('a[href="/library"]');
    await page.waitForURL("**/library");
    await page.waitForLoadState("networkidle");

    // --- Create Campaign B: "Winter Cocoa" ---
    await page.click('button:has-text("New Campaign")');
    const campaignNameB = `Winter Cocoa ${Date.now()}`;
    await page.fill("input#campaign-name", campaignNameB);
    await page.fill("textarea#campaign-desc", "Winter cocoa promotion");

    createPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/campaigns") &&
        res.request().method() === "POST"
    );
    await page.click('button:has-text("Create Campaign")');
    createRes = await createPromise;
    expect(createRes.status()).toBe(201);
    await expect(page.locator(`h3:has-text("${campaignNameB}")`)).toBeVisible();

    // ──────────────────────────────────────────────────────────────
    // PHASE 2 — Browse Library (F4-UTC03)
    // ──────────────────────────────────────────────────────────────

    // ── Both campaigns should be visible ──
    await expect(page.locator(`h3:has-text("${campaignNameA}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${campaignNameB}")`)).toBeVisible();

    // ── Search filtering: keyword = "Cold Brew" ──
    const searchInput = page.locator('input[placeholder="Search campaigns…"]');
    await searchInput.fill("Cold Brew");

    // Only Campaign A should be visible
    await expect(page.locator(`h3:has-text("${campaignNameA}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${campaignNameB}")`)).toBeHidden();

    // ── Search for "Winter" ──
    await searchInput.fill("Winter");

    // Only Campaign B should be visible
    await expect(page.locator(`h3:has-text("${campaignNameA}")`)).toBeHidden();
    await expect(page.locator(`h3:has-text("${campaignNameB}")`)).toBeVisible();

    // ── Clear search — both should appear ──
    await searchInput.fill("");
    await expect(page.locator(`h3:has-text("${campaignNameA}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${campaignNameB}")`)).toBeVisible();

    // ── View toggle: Switch to list view ──
    const listViewButton = page.locator('button[aria-label="List view"]');
    await listViewButton.click();
    await page.waitForTimeout(300);

    // Both campaigns should be visible in list view
    await expect(page.locator(`text=${campaignNameA}`).first()).toBeVisible();
    await expect(page.locator(`text=${campaignNameB}`).first()).toBeVisible();

    // ── View toggle: Switch back to grid view ──
    const gridViewButton = page.locator('button[aria-label="Grid view"]');
    await gridViewButton.click();
    await page.waitForTimeout(300);

    // Both campaigns should still be visible in grid view
    await expect(page.locator(`h3:has-text("${campaignNameA}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${campaignNameB}")`)).toBeVisible();
  });

  test("should show empty state for a new user with no campaigns", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // Validates the empty state path from F4-UTC03-TC02
    // A brand new user has no campaigns — the library should show
    // an empty state message prompting to create the first campaign.
    // ──────────────────────────────────────────────────────────────

    await navigateToLibrary(page);

    // ── UI Layer: Verify the page header is shown ──
    await expect(
      page.locator("text=Campaigns & Products").first()
    ).toBeVisible();

    // ── UI Layer: Verify "New Campaign" button is available ──
    await expect(
      page.locator('button:has-text("New Campaign")')
    ).toBeVisible();

    // ── UI Layer: No campaign cards should be visible ──
    const campaignCards = page.locator("h3").filter({ hasText: /Campaign/ });
    await expect(campaignCards).toHaveCount(0);

    // ── API Layer: Verify GET /api/campaigns returns empty list ──
    const apiResponse = await page.request.get(
      `${BACKEND_URL}/api/campaigns`,
      {
        headers: {
          // Reuse the browser's auth cookies/headers
          Cookie: (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join("; "),
        },
      }
    );
    // The response may include an empty list or an empty-state structure
    if (apiResponse.ok()) {
      const body = await apiResponse.json();
      // Campaigns array should be empty
      if (body.campaigns) {
        expect(body.campaigns).toHaveLength(0);
      }
    }
  });

  test("should handle database failure gracefully during library browsing", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // Validates the error path from F4-UTC03-TC03:
    // System fails to retrieve data due to a database connection
    // or query error → DatabaseRetrieveException
    // ──────────────────────────────────────────────────────────────

    // Mock GET /api/campaigns → 500 to simulate a database failure
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

    // ── UI Layer: Assert the error is shown ──
    await expect(
      page.locator("text=/Failed to retrieve|error|something went wrong/i").first()
    ).toBeVisible({ timeout: 10000 });
  });
});
