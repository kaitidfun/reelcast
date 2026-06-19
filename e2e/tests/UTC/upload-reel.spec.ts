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
  displayName: `UploadReelTest_${TEST_TIMESTAMP}`,
  email: `upload.reel.test+${TEST_TIMESTAMP}@reelcast.dev`,
  password: "Str0ng!Pass#2026",
};

const CAMPAIGN_NAME = `Upload Campaign ${TEST_TIMESTAMP}`;
const PRODUCT_NAME = `Upload Product ${TEST_TIMESTAMP}`;

// ─── Suite Lifecycle ────────────────────────────────────────────────

test.beforeAll(async () => {
  await connectDB();
  // Clean up any leftover user from previous interrupted runs
  await deleteUserByEmail(TEST_USER.email);
});

test.afterAll(async () => {
  await deleteUserByEmail(TEST_USER.email);
  await disconnectDB();
});

// ─── F2-UTC04: Upload Own Reel ──────────────────────────────────────

test.describe("F2-UTC04: Upload Own Reel", () => {
  // Allow generous timeout — upload flows involve file I/O + API calls
  test.describe.configure({ timeout: 120_000 });

  /** Auth token extracted after login, used for API calls in beforeEach */
  let authToken: string;
  /** Product ID returned from the API — needed for the upload endpoint */
  let productId: string;

  // ── beforeEach: register, verify, login, create campaign+product, navigate ──

  test.beforeEach(async ({ page, request }) => {
    // 1. Register test user via API
    const registerRes = await request.post(`${BACKEND_URL}/register`, {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
        display_name: TEST_USER.displayName,
      },
    });
    expect(registerRes.ok()).toBeTruthy();

    // 2. Verify email directly in the database
    await verifyUserEmail(TEST_USER.email);

    // 3. Login via UI
    await page.goto("/login");
    await page.fill("#email", TEST_USER.email);
    await page.fill("#password", TEST_USER.password);
    await page.click('button:has-text("Sign in")');

    // 4. Wait for redirect to authenticated root
    await page.waitForURL(/:\d+\/?$/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // 5. Extract auth token from localStorage
    authToken = await page.evaluate(() => localStorage.getItem("rf_token") ?? "");
    expect(authToken).toBeTruthy();

    // 6. Create a campaign via API
    const campaignRes = await request.post(`${BACKEND_URL}/api/campaigns`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: CAMPAIGN_NAME,
        description: "Campaign for upload reel E2E tests",
      },
    });
    expect(campaignRes.status()).toBe(201);
    const campaignData = await campaignRes.json();
    const campaignId: string = campaignData.campaign_id;

    // 7. Create a product under that campaign via API
    const productRes = await request.post(`${BACKEND_URL}/api/products`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        product_name: PRODUCT_NAME,
        campaign_id: campaignId,
        description: "Product for upload reel E2E tests",
        affiliate_link: "https://example.com/buy",
      },
    });
    expect(productRes.status()).toBe(201);
    const productData = await productRes.json();
    productId = productData.product_id;

    // 8. Navigate to the Create Reel page
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // Verify the Create Reel page heading is visible
    await expect(page.locator("h1:has-text('Create Reel')")).toBeVisible();

    // 9. Switch to Upload mode
    await page.click('button:has-text("Upload Video")');

    // 10. Select a product via the ProductPickerDialog
    //     Step A: Open the dialog
    await page.click('button:has-text("Select a product")');
    await expect(page.locator('text=Select Product').first()).toBeVisible();

    //     Step B: Click the campaign to drill into its products
    await page.click(`text=${CAMPAIGN_NAME}`);

    //     Step C: Click the product to select it (dialog auto-closes)
    await page.click(`text=${PRODUCT_NAME}`);
  });

  // ── afterEach: clean up the test user (cascades campaigns, products, reels) ──

  test.afterEach(async () => {
    await deleteUserByEmail(TEST_USER.email);
  });

  // ─────────────────────────────────────────────────────────────────
  // TC01: Successful video upload → Secure URL string
  // Test Data: F2-UTC04-TD01 — commercial_valid.mp4 (MP4, 100MB, 45s)
  // ─────────────────────────────────────────────────────────────────

  test("F2-UTC04-TC01: Successful video upload returns secure URL", async ({ page }) => {
    const MOCK_REEL_ID = "reel-upload-success-001";
    const MOCK_VIDEO_URL = "https://cdn.reelcast.dev/videos/commercial_valid_final.mp4";

    // Mock POST /api/reels/upload-video → 200 with reel in Pending status
    await page.route("**/api/reels/upload-video", async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            reel_id: MOCK_REEL_ID,
            status: "Pending",
            product_id: productId,
            prompt_text: "",
            raw_video_url: null,
            final_commercial_video_url: null,
            caption_and_hashtags: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock GET /api/reels/*/status → Completed with final video URL
    await page.route(`**/api/reels/${MOCK_REEL_ID}/status`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            reel_id: MOCK_REEL_ID,
            status: "Completed",
            final_commercial_video_url: MOCK_VIDEO_URL,
            raw_video_url: "https://cdn.reelcast.dev/videos/commercial_valid_raw.mp4",
            caption_and_hashtags: {
              caption: "Summer vibes with our new sunscreen!",
              hashtags: ["#summer", "#skincare"],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Locate the hidden file input and set a fake MP4 file
    const fileInput = page.locator('input[type="file"][accept*=".mp4"]');
    await fileInput.setInputFiles({
      name: "commercial_valid.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake-mp4-video-content-for-e2e-testing"),
    });

    // Verify the file name appears in the UI after selection
    await expect(page.locator("text=commercial_valid.mp4")).toBeVisible();

    // Set up response interception before clicking upload
    const uploadResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/upload-video") &&
        res.request().method() === "POST"
    );

    // Click the Upload & Process button
    await page.click('button:has-text("Upload & Process")');

    // Wait for the upload API response
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(200);

    // Parse the upload response body
    const uploadBody = await uploadResponse.json();
    expect(uploadBody.reel_id).toBe(MOCK_REEL_ID);
    expect(uploadBody.status).toBe("Pending");

    // Wait for the status polling to resolve to Completed
    // The UI should transition from rendering/processing to Ready
    await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    // Verify the video preview or player is shown after completion
    // The final_commercial_video_url should result in a video player
    const videoElement = page.locator("video");
    await expect(videoElement).toBeVisible({ timeout: 15_000 });

    // Verify the caption block appears with generated caption
    await expect(page.locator("text=Caption")).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────
  // TC02: Unsupported video format (MKV) → UnsupportedVideoFormatException
  // Test Data: F2-UTC04-TD02 — commercial_invalid.mkv (MKV, 100MB, 45s)
  // ─────────────────────────────────────────────────────────────────

  test("F2-UTC04-TC02: Unsupported video format (MKV) returns UnsupportedVideoFormatException", async ({
    page,
  }) => {
    // Mock POST /api/reels/upload-video → 400 with unsupported format error
    await page.route("**/api/reels/upload-video", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "Unsupported video format. Allowed: mp4, mov, avi",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Set a fake MKV file via the hidden file input
    // Note: The frontend accept attribute filters .mp4,.mov,.avi, but we bypass
    // that via setInputFiles (programmatic). The server-side validation catches it.
    const fileInput = page.locator('input[type="file"][accept*=".mp4"]');
    await fileInput.setInputFiles({
      name: "commercial_invalid.mkv",
      mimeType: "video/x-matroska",
      buffer: Buffer.from("fake-mkv-video-content-for-e2e-testing"),
    });

    // Verify the file name appears in the UI after selection
    await expect(page.locator("text=commercial_invalid.mkv")).toBeVisible();

    // Set up response interception before clicking upload
    const uploadResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/upload-video") &&
        res.request().method() === "POST"
    );

    // Click the Upload & Process button
    await page.click('button:has-text("Upload & Process")');

    // Wait for the upload API response (should be 400)
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(400);

    // Parse and verify the error detail
    const errorBody = await uploadResponse.json();
    expect(errorBody.detail).toBe(
      "Unsupported video format. Allowed: mp4, mov, avi"
    );

    // Verify the UI shows an error toast or message to the user
    await expect(
      page.locator("text=Unsupported video format").first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify the preview panel stays in Standby — no processing started
    await expect(page.getByText("Ready", { exact: true })).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────
  // TC03: Video exceeding 500MB size limit → VideoSizeLimitExceededException
  // Test Data: F2-UTC04-TD03 — commercial_oversize.mp4 (MP4, 650MB, 45s)
  // ─────────────────────────────────────────────────────────────────

  test("F2-UTC04-TC03: Video exceeding 500MB size limit returns VideoSizeLimitExceededException", async ({
    page,
  }) => {
    // Mock POST /api/reels/upload-video → 400 with size limit error
    await page.route("**/api/reels/upload-video", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "Video file size exceeds the 500MB limit",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Set a fake oversized MP4 file via the hidden file input
    // We use a small buffer but mock the server response to simulate 650MB rejection
    const fileInput = page.locator('input[type="file"][accept*=".mp4"]');
    await fileInput.setInputFiles({
      name: "commercial_oversize.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake-oversize-mp4-video-content-for-e2e-testing"),
    });

    // Verify the file name appears in the UI after selection
    await expect(page.locator("text=commercial_oversize.mp4")).toBeVisible();

    // Set up response interception before clicking upload
    const uploadResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/upload-video") &&
        res.request().method() === "POST"
    );

    // Click the Upload & Process button
    await page.click('button:has-text("Upload & Process")');

    // Wait for the upload API response (should be 400)
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(400);

    // Parse and verify the error detail
    const errorBody = await uploadResponse.json();
    expect(errorBody.detail).toBe(
      "Video file size exceeds the 500MB limit"
    );

    // Verify the UI shows an error toast or message about the size limit
    await expect(
      page.locator("text=Video file size exceeds").first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify the preview panel stays in Standby — no processing started
    await expect(page.getByText("Ready", { exact: true })).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────
  // TC04: Video exceeding 60-second duration → DurationExceededException
  // ─────────────────────────────────────────────────────────────────

  test("F2-UTC04-TC04: Video exceeding 60 seconds returns DurationExceededException", async ({
    page,
  }) => {
    await page.route("**/api/reels/upload-video", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "DurationExceededException: Video duration exceeds the 60-second limit",
            exception: "DurationExceededException",
          }),
        });
      } else {
        await route.continue();
      }
    });

    const fileInput = page.locator('input[type="file"][accept*=".mp4"]');
    await fileInput.setInputFiles({
      name: "commercial_over_60_seconds.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake-long-mp4-video-content-for-e2e-testing"),
    });

    const uploadResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/upload-video") &&
        res.request().method() === "POST"
    );

    await page.click('button:has-text("Upload & Process")');
    const uploadResponse = await uploadResponsePromise;

    expect(uploadResponse.status()).toBe(400);
    const errorBody = await uploadResponse.json();
    expect(errorBody.exception).toBe("DurationExceededException");
    expect(errorBody.detail).toContain("60-second limit");

    await expect(
      page.locator("text=Video duration exceeds").first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Ready", { exact: true })).not.toBeVisible();
  });
});
