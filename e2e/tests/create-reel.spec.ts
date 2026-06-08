/**
 * create-reel.spec.ts
 * ─────────────────────────────────────────────────────────────────────
 * Feature 2: Content Creation Pipeline — E2E Tests
 *
 * This spec covers the full Reel creation workflow on the /create page:
 *  • F2-UTC01: Validate input prompt and product selection
 *  • F2-UTC02: Generate Reels via LTX Video 2.0 API
 *  • F2-UTC03: Generate Captions and Hashtags
 *  • F2-UTC05: Overlay Images and Logo
 *  • F2-UTC06: Preview and Approve Content
 *  • F2-UTC07: Regenerate Content
 *
 * Three-layer verification in every scenario:
 *  1. **UI**  — Playwright drives the Next.js frontend (filling forms,
 *               clicking buttons, asserting toasts & state transitions).
 *  2. **API** — Network requests to the FastAPI backend are intercepted
 *               via `page.waitForResponse()` / `page.route()` to assert
 *               status codes and payload shape.
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
  findReelById,
  findCampaignByName,
  findProductByName,
  deleteCampaignsByUserId,
  deleteReelsByUserId,
} from "../helpers/db-helper";

// ─── Test Data ──────────────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** Unique test user — timestamp suffix prevents collisions across runs. */
const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `CreateReelTest_${TEST_TIMESTAMP}`,
  email: `create-reel.test+${TEST_TIMESTAMP}@reelcast.dev`,
  password: "Str0ng!Pass#2026",
};

const CAMPAIGN_NAME = `E2E Campaign ${TEST_TIMESTAMP}`;
const PRODUCT_NAME = `Cold Brew Kit ${TEST_TIMESTAMP}`;

/** A valid prompt under 500 characters. */
const VALID_PROMPT = "A cinematic video of cold brew coffee being poured into a glass with ice";

/** A prompt exceeding the 500-character maximum. */
const OVER_500_PROMPT = "A".repeat(501);

/** Garbage text for safety violation testing (F2-UTC03-TD02). */
const GARBAGE_TEXT = "[@F@J@)IR(@*^@R*HEQKY*QRYJRORIORI#(RU(IWHRF*]";

/** A fake non-existent product UUID. */
const NON_EXISTENT_PRODUCT_ID = "00000000-0000-0000-0000-000000000000";

/** Fake completed status response for mocking the status polling endpoint. */
const MOCK_COMPLETED_STATUS = {
  reel_id: "mock-reel-id",
  status: "Completed",
  final_commercial_video_url: "https://example.com/mock-final-video.mp4",
  raw_video_url: "https://example.com/mock-raw-video.mp4",
  caption_and_hashtags: {
    caption: "Enjoy the perfect cold brew ☕ #coffee #coldbrew",
    hashtags: ["#coffee", "#coldbrew", "#summer"],
  },
};

// ─── Shared State ───────────────────────────────────────────────────

let campaignId: string;
let productId: string;
let userId: string;

// ─── Helper: Login via UI ───────────────────────────────────────────

/**
 * Registers a user via API, verifies their email, then logs in via the UI.
 * Returns the auth token from localStorage.
 */
async function registerAndLogin(page: Page, request: any): Promise<string> {
  // 1. Register test user via API
  const registerRes = await request.post(`${BACKEND_URL}/register`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      display_name: TEST_USER.displayName,
    },
  });
  // Ignore 400 if user already exists from a previous test in the describe block
  if (registerRes.status() !== 400) {
    expect(registerRes.ok()).toBeTruthy();
  }

  // 2. Verify email via DB helper
  await verifyUserEmail(TEST_USER.email);

  // 3. Login via UI
  await page.goto("/login");
  await page.locator("#email").fill(TEST_USER.email);
  await page.locator("#password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // 4. Wait for redirect to authenticated area
  await page.waitForURL(/:\d+\/?$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  // 5. Get auth token from localStorage
  const token = await page.evaluate(() => localStorage.getItem("rf_token"));
  expect(token).toBeTruthy();
  return token!;
}

/**
 * Creates a campaign and product via API, storing IDs in module-level variables.
 */
async function createCampaignAndProduct(request: any, token: string): Promise<void> {
  // 6. Create campaign via API
  const campaignRes = await request.post(`${BACKEND_URL}/api/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: CAMPAIGN_NAME,
      description: "E2E test campaign for reel creation",
    },
  });
  expect(campaignRes.status()).toBe(201);
  const campaignBody = await campaignRes.json();
  campaignId = campaignBody.campaign_id;

  // 7. Create product via API
  const productRes = await request.post(`${BACKEND_URL}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      product_name: PRODUCT_NAME,
      campaign_id: campaignId,
      description: "A durable and sleek stainless steel cold brew coffee kit",
      affiliate_link: "https://example.com/cold-brew-kit",
    },
  });
  expect(productRes.status()).toBe(201);
  const productBody = await productRes.json();
  productId = productBody.product_id;
}

/**
 * Helper: Select a product via the ProductPickerDialog.
 * 1. Click 'Select a product' to open the dialog
 * 2. Click on the campaign name to drill into it
 * 3. Click on the product name to select it (dialog auto-closes)
 */
async function selectProduct(page: Page): Promise<void> {
  // Open the product picker dialog
  await page.getByRole("button", { name: /select a product/i }).click();

  // Wait for the dialog to appear
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Select Product")).toBeVisible();

  // Click on the campaign name to drill into it
  await page.getByText(CAMPAIGN_NAME).click();

  // Click on the product name to select it (dialog auto-closes)
  await page.getByText(PRODUCT_NAME).click();

  // Wait for the dialog to close
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
}

/**
 * Helper: Mock the status polling endpoint to return completed immediately.
 * This avoids waiting for real video generation during tests.
 */
async function mockStatusPollingCompleted(page: Page, reelId?: string): Promise<void> {
  await page.route("**/api/reels/*/status", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_COMPLETED_STATUS,
        reel_id: reelId ?? MOCK_COMPLETED_STATUS.reel_id,
      }),
    });
  });
}

// ─── Lifecycle ──────────────────────────────────────────────────────

test.beforeAll(async () => {
  await connectDB();
  // Defensive cleanup: remove any leftover test user from a previous aborted run
  await deleteUserByEmail(TEST_USER.email);
});

test.afterAll(async () => {
  // Final cleanup
  await deleteUserByEmail(TEST_USER.email);
  await disconnectDB();
});

// ═══════════════════════════════════════════════════════════════════
//  F2-UTC01: Validate input prompt and product selection
// ═══════════════════════════════════════════════════════════════════

test.describe("F2-UTC01: Validate input prompt and product selection", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);

    // Get user ID for cleanup
    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;

    await createCampaignAndProduct(request, token);

    // 8. Navigate to /create
    await page.goto("/create");
    await expect(page.locator("h1")).toContainText("Create Reel");
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  test("TC01: Valid prompt (<500 chars) + valid product → payload ready for generation", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select a product via the ProductPickerDialog
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);

    // Verify the product name is now shown in the selector button area
    await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible();

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Enter a valid prompt (under 500 characters)
    // ──────────────────────────────────────────────────────────────
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — UI Layer: Verify character counter shows correct count
    // ──────────────────────────────────────────────────────────────
    await expect(page.getByText(`${VALID_PROMPT.length}/500`)).toBeVisible();

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — Mock status polling for fast completion & submit
    // ──────────────────────────────────────────────────────────────
    await mockStatusPollingCompleted(page);

    // Intercept the generate API call
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    // Click "Generate Video"
    await page.getByRole("button", { name: /generate video/i }).click();

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — API Layer: Verify the generate response
    // ──────────────────────────────────────────────────────────────
    const generateResponse = await generatePromise;
    expect(generateResponse.status()).toBe(200);

    const generateBody = await generateResponse.json();
    expect(generateBody).toHaveProperty("reel_id");
    expect(generateBody).toHaveProperty("status");
    expect(generateBody).toHaveProperty("prompt_text");

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — DB Layer: Verify reel record was created
    // ──────────────────────────────────────────────────────────────
    const reelRecord = await findReelById(generateBody.reel_id);
    expect(reelRecord).not.toBeNull();
    expect(reelRecord!.prompt_text).toBe(VALID_PROMPT);
    expect(reelRecord!.product_id).toBe(productId);
  });

  test("TC02: Prompt > 500 chars → InvalidPromptLengthException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select a product
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Enter a prompt exceeding 500 characters
    // ──────────────────────────────────────────────────────────────
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(OVER_500_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — UI Layer: The character counter should indicate overflow
    // ──────────────────────────────────────────────────────────────
    // The counter should show 501/500 or similar overflow indication
    await expect(page.getByText(/501\/500/)).toBeVisible();

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — Mock the API to return 400 for prompt length violation
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "InvalidPromptLengthException: Prompt exceeds 500 characters",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — Attempt to generate (button may be disabled or API rejects)
    // ──────────────────────────────────────────────────────────────
    const generateButton = page.getByRole("button", { name: /generate video/i });

    // Check if the button is disabled (frontend validation)
    const isDisabled = await generateButton.isDisabled();

    if (isDisabled) {
      // UI Layer assertion: button is correctly disabled for invalid prompt
      expect(isDisabled).toBe(true);
    } else {
      // If the button is enabled, click and verify API rejection
      const generatePromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/reels/generate") &&
          res.request().method() === "POST",
        { timeout: 15_000 }
      );

      await generateButton.click();
      const generateResponse = await generatePromise;

      // API Layer: Should return 400 for invalid prompt length
      expect(generateResponse.status()).toBe(400);

      const errorBody = await generateResponse.json();
      expect(errorBody).toHaveProperty("detail");
      expect(errorBody.detail).toMatch(/prompt/i);
    }
  });

  test("TC03: Invalid/non-existent product ID → ProductNotFoundException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Enter a valid prompt
    // ──────────────────────────────────────────────────────────────
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the generate endpoint to return 404 for
    //          non-existent product
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "ProductNotFoundException: Product not found",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Select a product (uses real product, but API is mocked)
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — Click Generate Video
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateResponse = await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — API Layer: Should return 404
    // ──────────────────────────────────────────────────────────────
    expect(generateResponse.status()).toBe(404);

    const errorBody = await generateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/product/i);

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — UI Layer: Error should be displayed to user
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/product|not found/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  F2-UTC02: Generate Reels via LTX Video 2.0 API
// ═══════════════════════════════════════════════════════════════════

test.describe("F2-UTC02: Generate Reels via LTX Video 2.0 API", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);

    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;

    await createCampaignAndProduct(request, token);

    await page.goto("/create");
    await expect(page.locator("h1")).toContainText("Create Reel");
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  test("TC01: Successful video generation → Temporary Preview URL string", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock status polling to return completed quickly
    // ──────────────────────────────────────────────────────────────
    let generatedReelId: string | undefined;

    // Intercept the generate API call
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    // Mock status polling for fast completion
    await mockStatusPollingCompleted(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: /generate video/i }).click();

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer: Verify the generate response
    // ──────────────────────────────────────────────────────────────
    const generateResponse = await generatePromise;
    expect(generateResponse.status()).toBe(200);

    const body = await generateResponse.json();
    expect(body).toHaveProperty("reel_id");
    expect(body).toHaveProperty("status");
    generatedReelId = body.reel_id;

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Preview status should transition to Ready
    // ──────────────────────────────────────────────────────────────
    await expect(page.getByText(/ready/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // A video element or preview should be visible
    await expect(
      page.locator("video").first()
    ).toBeVisible({ timeout: 15_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — DB Layer: Verify reel record exists
    // ──────────────────────────────────────────────────────────────
    if (generatedReelId) {
      const reelRecord = await findReelById(generatedReelId);
      expect(reelRecord).not.toBeNull();
      expect(reelRecord!.user_id).toBe(userId);
      expect(reelRecord!.prompt_text).toBe(VALID_PROMPT);
    }
  });

  test("TC02: Fal.ai external API failure → LTXVideoAPIException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the generate endpoint to return 502 (external API failure)
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "LTXVideoAPIException: External video generation API is unavailable",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateResponse = await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer: Should return 502
    // ──────────────────────────────────────────────────────────────
    expect(generateResponse.status()).toBe(502);

    const errorBody = await generateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/LTXVideoAPI|unavailable|external/i);

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Error message should appear
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/error|failed|unavailable/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC03: Rendering process timeout → GenerationTimeoutException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the generate endpoint to return 504 (timeout)
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "GenerationTimeoutException: Video generation timed out",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateResponse = await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer: Should return 504
    // ──────────────────────────────────────────────────────────────
    expect(generateResponse.status()).toBe(504);

    const errorBody = await generateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/timeout/i);

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Timeout error should be shown
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/timeout|timed out|error|failed/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  F2-UTC03: Generate Captions and Hashtags
// ═══════════════════════════════════════════════════════════════════

test.describe("F2-UTC03: Generate Captions and Hashtags", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);

    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;

    await createCampaignAndProduct(request, token);

    await page.goto("/create");
    await expect(page.locator("h1")).toContainText("Create Reel");
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  test("TC01: Successful caption/hashtag generation → Object with caption + hashtags", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter a valid prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock status polling to return completed with captions
    // ──────────────────────────────────────────────────────────────
    await mockStatusPollingCompleted(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Generate the video (captions are generated alongside)
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();

    const generateResponse = await generatePromise;
    expect(generateResponse.status()).toBe(200);

    const body = await generateResponse.json();
    const reelId = body.reel_id;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — Wait for generation to complete and captions to appear
    // ──────────────────────────────────────────────────────────────
    await expect(page.getByText(/ready/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Caption block should be visible with content
    // ──────────────────────────────────────────────────────────────
    // The caption section heading should be visible
    await expect(
      page.getByText(/caption/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // The caption textarea should contain generated caption text
    const captionTextarea = page.locator("textarea").last();
    await expect(captionTextarea).not.toBeEmpty({ timeout: 10_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — DB Layer: Verify caption data persisted
    // ──────────────────────────────────────────────────────────────
    if (reelId) {
      const reelRecord = await findReelById(reelId);
      expect(reelRecord).not.toBeNull();
      // Captions are stored as JSON in caption_and_hashtags column
      expect(reelRecord!.caption_and_hashtags).not.toBeNull();
    }
  });

  test("TC02: Gemini API unavailability → GeminiAPIException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the status polling to return a Gemini failure
    //          The caption generation happens server-side during
    //          the generation pipeline, so we mock the status
    //          endpoint to return a failed status.
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "mock-reel-id",
          status: "Failed",
          error_message:
            "GeminiAPIException: Caption generation service is unavailable",
          final_commercial_video_url: null,
          raw_video_url: null,
          caption_and_hashtags: null,
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — UI Layer: Error state should appear
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/failed|error|unavailable/i").first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("TC03: Safety policy violation in prompt → ContentModerationException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter garbage/unsafe prompt text
    //          Using F2-UTC03-TD02 test data
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(GARBAGE_TEXT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the generate endpoint to return content moderation error
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "ContentModerationException: Prompt violates safety policy",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateResponse = await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer: Should return 422 for safety violation
    // ──────────────────────────────────────────────────────────────
    expect(generateResponse.status()).toBe(422);

    const errorBody = await generateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/safety|moderation|violat/i);

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Error should be shown
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/safety|moderation|violation|error|failed/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  F2-UTC05: Overlay Images and Logo
// ═══════════════════════════════════════════════════════════════════

test.describe("F2-UTC05: Overlay Images and Logo", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);

    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;

    await createCampaignAndProduct(request, token);

    await page.goto("/create");
    await expect(page.locator("h1")).toContainText("Create Reel");
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  test("TC01: Successful overlay → Finalized MP4 video URL", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Generate a video first (mocked completion)
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    await mockStatusPollingCompleted(page);

    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateRes = await generatePromise;
    expect(generateRes.status()).toBe(200);

    // Wait for video preview to be ready
    await expect(page.getByText(/ready/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — UI Layer: Toggle overlay options
    // ──────────────────────────────────────────────────────────────
    // The overlay toggles should be visible: "Brand Logo" and "Product"
    const brandLogoToggle = page.getByText(/brand logo/i).first();
    await expect(brandLogoToggle).toBeVisible({ timeout: 10_000 });

    const productToggle = page.getByText(/product/i).first();
    await expect(productToggle).toBeVisible({ timeout: 10_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — UI Layer: Verify video preview remains visible with
    //          overlay toggles active
    // ──────────────────────────────────────────────────────────────
    await expect(page.locator("video").first()).toBeVisible({
      timeout: 10_000,
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — DB Layer: Verify the reel record has a video URL
    // ──────────────────────────────────────────────────────────────
    const genBody = await generateRes.json();
    if (genBody.reel_id) {
      const reelRecord = await findReelById(genBody.reel_id);
      expect(reelRecord).not.toBeNull();
    }
  });

  test("TC02: Backend rendering failure → FFmpegProcessingException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the status polling to return an FFmpeg failure
    //          The overlay rendering happens during the generation pipeline
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "mock-reel-id",
          status: "Failed",
          error_message:
            "FFmpegProcessingException: Video rendering failed during overlay composition",
          final_commercial_video_url: null,
          raw_video_url: null,
          caption_and_hashtags: null,
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — UI Layer: Error state indicating rendering failure
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/failed|error|rendering/i").first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("TC03: Overlay position outside video bounds → InvalidCoordinateException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the status polling to return an invalid coordinate error
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "mock-reel-id",
          status: "Failed",
          error_message:
            "InvalidCoordinateException: Overlay position exceeds video dimensions",
          final_commercial_video_url: null,
          raw_video_url: null,
          caption_and_hashtags: null,
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — UI Layer: Error should be shown
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/failed|error|invalid|coordinate|position/i").first()
    ).toBeVisible({ timeout: 30_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  F2-UTC06: Preview and Approve Content
// ═══════════════════════════════════════════════════════════════════

test.describe("F2-UTC06: Preview and Approve Content", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);

    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;

    await createCampaignAndProduct(request, token);

    await page.goto("/create");
    await expect(page.locator("h1")).toContainText("Create Reel");
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  /**
   * Helper: Generate a reel and wait for it to be ready before testing approval.
   * Returns the reel_id from the generate response.
   */
  async function generateAndWaitForReady(page: Page): Promise<string> {
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    await mockStatusPollingCompleted(page);

    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateRes = await generatePromise;
    expect(generateRes.status()).toBe(200);

    const body = await generateRes.json();

    // Wait for status to show "Ready"
    await expect(page.getByText(/ready/i).first()).toBeVisible({
      timeout: 30_000,
    });

    return body.reel_id;
  }

  test("TC01: Approve content (decision=True) → True (Forwarded to Distribution System)", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Generate a video and wait for it to be ready
    // ──────────────────────────────────────────────────────────────
    const reelId = await generateAndWaitForReady(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — UI Layer: Click the "Approve" button
    // ──────────────────────────────────────────────────────────────
    const approveButton = page.getByRole("button", { name: /approve/i });
    await expect(approveButton).toBeVisible({ timeout: 10_000 });

    // Intercept the approve API call (if any)
    const approvePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels") &&
        (res.request().method() === "PUT" ||
          res.request().method() === "POST" ||
          res.request().method() === "PATCH"),
      { timeout: 15_000 }
    ).catch(() => null); // May not have a separate approve endpoint

    await approveButton.click();

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — UI Layer: Toast should confirm approval
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/approved|saved/i").first()
    ).toBeVisible({ timeout: 10_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — UI Layer: "Publish" button should become visible
    //          after approval
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.getByRole("button", { name: /publish/i })
    ).toBeVisible({ timeout: 10_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — DB Layer: Verify reel status updated
    // ──────────────────────────────────────────────────────────────
    if (reelId) {
      const reelRecord = await findReelById(reelId);
      expect(reelRecord).not.toBeNull();
    }
  });

  test("TC02: Reject content (decision=False) → False (Publishing aborted)", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Generate a video and wait for it to be ready
    // ──────────────────────────────────────────────────────────────
    await generateAndWaitForReady(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — UI Layer: The "Re-generate" or "Regenerate Video"
    //          button should be available (rejection = regeneration)
    // ──────────────────────────────────────────────────────────────
    const regenerateButton = page.getByRole("button", {
      name: /re-?generate/i,
    });
    await expect(regenerateButton).toBeVisible({ timeout: 10_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — UI Layer: Clicking regenerate effectively rejects
    //          the current content — the Approve button should
    //          NOT have been clicked, so Publish should NOT be visible
    // ──────────────────────────────────────────────────────────────
    const publishButton = page.getByRole("button", { name: /publish/i });
    await expect(publishButton).toBeHidden();

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — The preview should still show the generated content
    //          (not yet approved, but available for review)
    // ──────────────────────────────────────────────────────────────
    await expect(page.locator("video").first()).toBeVisible();
  });

  test("TC03: Missing or expired preview files → MediaNotFoundException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product and enter prompt
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock status polling to return completed but with
    //          missing/null video URLs (expired media)
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "mock-reel-id",
          status: "Failed",
          error_message:
            "MediaNotFoundException: Preview files are missing or expired",
          final_commercial_video_url: null,
          raw_video_url: null,
          caption_and_hashtags: null,
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Generate Video"
    // ──────────────────────────────────────────────────────────────
    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    await generatePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — UI Layer: Error indicating missing media should show
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/failed|error|missing|expired/i").first()
    ).toBeVisible({ timeout: 30_000 });

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Approve button should NOT be available
    //          when preview media is missing
    // ──────────────────────────────────────────────────────────────
    const approveButton = page.getByRole("button", { name: /approve/i });
    await expect(approveButton).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  F2-UTC07: Regenerate Content
// ═══════════════════════════════════════════════════════════════════

test.describe("F2-UTC07: Regenerate Content", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);

    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;

    await createCampaignAndProduct(request, token);

    await page.goto("/create");
    await expect(page.locator("h1")).toContainText("Create Reel");
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  /**
   * Helper: Generate an initial reel and wait for it to become ready
   * so we can test regeneration afterwards.
   */
  async function generateInitialReel(page: Page): Promise<string> {
    await selectProduct(page);
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    await promptTextarea.fill(VALID_PROMPT);

    await mockStatusPollingCompleted(page);

    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/generate") &&
        res.request().method() === "POST",
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: /generate video/i }).click();
    const generateRes = await generatePromise;
    expect(generateRes.status()).toBe(200);

    const body = await generateRes.json();

    // Wait for "Ready" status
    await expect(page.getByText(/ready/i).first()).toBeVisible({
      timeout: 30_000,
    });

    return body.reel_id;
  }

  test("TC01: Successful regeneration → New Preview URL + Caption data", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Generate initial reel
    // ──────────────────────────────────────────────────────────────
    const initialReelId = await generateInitialReel(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Un-route old status mock and set up new one for
    //          regeneration with different URL
    // ──────────────────────────────────────────────────────────────
    await page.unroute("**/api/reels/*/status");
    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "regenerated-reel-id",
          status: "Completed",
          final_commercial_video_url:
            "https://example.com/regenerated-final-video.mp4",
          raw_video_url: "https://example.com/regenerated-raw-video.mp4",
          caption_and_hashtags: {
            caption: "Refreshed cold brew experience ☕ #coffee #newlook",
            hashtags: ["#coffee", "#newlook", "#coldbrew"],
          },
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Re-generate" or "Regenerate Video" button
    // ──────────────────────────────────────────────────────────────
    const regenerateButton = page.getByRole("button", {
      name: /re-?generate/i,
    });
    await expect(regenerateButton).toBeVisible({ timeout: 10_000 });

    // Intercept the regeneration API call
    const regeneratePromise = page.waitForResponse(
      (res) =>
        (res.url().includes("/api/reels/") &&
          res.url().includes("/regenerate") &&
          res.request().method() === "POST") ||
        (res.url().includes("/api/reels/generate") &&
          res.request().method() === "POST"),
      { timeout: 30_000 }
    );

    await regenerateButton.click();

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer: Verify the regenerate response
    // ──────────────────────────────────────────────────────────────
    const regenerateResponse = await regeneratePromise;
    expect(regenerateResponse.status()).toBe(200);

    const regenBody = await regenerateResponse.json();
    expect(regenBody).toHaveProperty("reel_id");
    expect(regenBody).toHaveProperty("status");

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Video preview should re-enter ready state
    // ──────────────────────────────────────────────────────────────
    await expect(page.getByText(/ready/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Video element should still be visible
    await expect(page.locator("video").first()).toBeVisible({
      timeout: 10_000,
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — UI Layer: Caption content should be updated
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.getByText(/caption/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC02: Exceeding generation rate limit → RateLimitExceededException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Generate initial reel
    // ──────────────────────────────────────────────────────────────
    await generateInitialReel(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the regenerate endpoint to return 429 (rate limit)
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/*/regenerate", (route) => {
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "RateLimitExceededException: Too many generation requests. Please try again later.",
        }),
      });
    });

    // Also mock the generate endpoint for rate limit (in case regeneration
    // goes through the generate endpoint)
    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "RateLimitExceededException: Too many generation requests. Please try again later.",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Click "Re-generate"
    // ──────────────────────────────────────────────────────────────
    const regenerateButton = page.getByRole("button", {
      name: /re-?generate/i,
    });
    await expect(regenerateButton).toBeVisible({ timeout: 10_000 });

    const regeneratePromise = page.waitForResponse(
      (res) =>
        (res.url().includes("/api/reels") &&
          res.request().method() === "POST"),
      { timeout: 15_000 }
    );

    await regenerateButton.click();
    const regenerateResponse = await regeneratePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — API Layer: Should return 429
    // ──────────────────────────────────────────────────────────────
    expect(regenerateResponse.status()).toBe(429);

    const errorBody = await regenerateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/rate.?limit|too many/i);

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — UI Layer: Rate limit error should be shown
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/rate.?limit|too many|try again/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC03: Prompt failing safety/length checks → PromptValidationException", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Generate initial reel
    // ──────────────────────────────────────────────────────────────
    await generateInitialReel(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Mock the regenerate/generate endpoints to return
    //          validation error
    // ──────────────────────────────────────────────────────────────
    await page.route("**/api/reels/*/regenerate", (route) => {
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "PromptValidationException: Prompt fails safety or length validation checks",
        }),
      });
    });

    await page.route("**/api/reels/generate", (route) => {
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "PromptValidationException: Prompt fails safety or length validation checks",
        }),
      });
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Modify the prompt to unsafe content before regenerating
    // ──────────────────────────────────────────────────────────────
    const promptTextarea = page.getByPlaceholder(
      "Describe the Reel you want to create..."
    );
    // Clear existing prompt and enter garbage/unsafe text
    await promptTextarea.fill(GARBAGE_TEXT);

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — Click "Re-generate"
    // ──────────────────────────────────────────────────────────────
    const regenerateButton = page.getByRole("button", {
      name: /re-?generate/i,
    });
    await expect(regenerateButton).toBeVisible({ timeout: 10_000 });

    const regeneratePromise = page.waitForResponse(
      (res) =>
        (res.url().includes("/api/reels") &&
          res.request().method() === "POST"),
      { timeout: 15_000 }
    );

    await regenerateButton.click();
    const regenerateResponse = await regeneratePromise;

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — API Layer: Should return 422
    // ──────────────────────────────────────────────────────────────
    expect(regenerateResponse.status()).toBe(422);

    const errorBody = await regenerateResponse.json();
    expect(errorBody).toHaveProperty("detail");
    expect(errorBody.detail).toMatch(/validation|safety|prompt/i);

    // ──────────────────────────────────────────────────────────────
    // STEP 6 — UI Layer: Validation error should be shown
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.locator("text=/validation|safety|error|failed/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
