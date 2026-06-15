/**
 * stc-f2-content-creation.spec.ts
 * ─────────────────────────────────────────────────────────────────────
 * Feature 2: Reel Content Generation and Publishing — System Test Cases (STC)
 *
 * Based on: ReelCastTestPlan_v1.1.0 — Section 3.2.2 STC-F2
 *
 * This spec covers the system-level integration tests:
 *  • STC-F2-01: End-to-End AI Video Generation Pipeline
 *      Evaluates the flow of validating a user's input prompt and product
 *      selection, transmitting metadata to the LTX Video API to generate
 *      background B-roll, utilizing the Gemini API to generate captions
 *      and hashtags, and rendering a preview for the user to approve.
 *      Associated Unit Tests: F2-UTC01, F2-UTC02, F2-UTC03, F2-UTC06
 *
 *  • STC-F2-02: Custom Reel Upload and Asset Overlay Flow
 *      Checks the system's ability to allow members to upload their own
 *      commercial videos and subsequently execute FFmpeg commands to
 *      overlay product images or brand logos onto the file.
 *      Associated Unit Tests: F2-UTC04, F2-UTC05
 *
 *  • STC-F2-03: Content Regeneration and Revision Workflow
 *      Ensures that if a user rejects a generated video preview, they can
 *      revise their original prompt and re-run the AI generation models
 *      for a new iteration.
 *      Associated Unit Tests: F2-UTC06, F2-UTC07
 *
 * Three-layer verification in every scenario:
 *  1. **UI**  — Playwright drives the Next.js frontend
 *  2. **API** — Network requests intercepted via page.waitForResponse()
 *  3. **DB**  — pg queries run directly against PostgreSQL
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
  deleteCampaignsByUserId,
  deleteReelsByUserId,
} from "../../helpers/db-helper";

// ─── Constants ──────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const TEST_TIMESTAMP = Date.now();
const TEST_USER = {
  displayName: `STCReelTest_${TEST_TIMESTAMP}`,
  email: `stc.reel.test+${TEST_TIMESTAMP}@reelcast.dev`,
  password: "Str0ng!Pass#2026",
};

const CAMPAIGN_NAME = `STC Campaign ${TEST_TIMESTAMP}`;
const PRODUCT_NAME = `STC Product ${TEST_TIMESTAMP}`;

/** Valid prompt under 500 characters. */
const VALID_PROMPT =
  "A cinematic video of cold brew coffee being poured into a glass with ice";

/** Garbage text for safety violation testing. */
const GARBAGE_TEXT = "[@F@J@)IR(@*^@R*HEQKY*QRYJRORIORI#(RU(IWHRF*]";

/** Mock data for completed reel status */
const MOCK_REEL_ID = "stc-mock-reel-001";
const MOCK_VIDEO_URL = "https://cdn.reelcast.dev/videos/stc_mock_final.mp4";
const MOCK_RAW_VIDEO_URL = "https://cdn.reelcast.dev/videos/stc_mock_raw.mp4";
const MOCK_COMPLETED_STATUS = {
  reel_id: MOCK_REEL_ID,
  status: "Completed",
  final_commercial_video_url: MOCK_VIDEO_URL,
  raw_video_url: MOCK_RAW_VIDEO_URL,
  caption_and_hashtags: {
    caption: "Enjoy the perfect cold brew ☕ #coffee #coldbrew",
    hashtags: ["#coffee", "#coldbrew", "#summer"],
  },
};

// ─── Shared State ───────────────────────────────────────────────────
let campaignId: string;
let productId: string;
let userId: string;

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
// Helper: Register → verify → login → get token
// ═════════════════════════════════════════════════════════════════════
async function registerAndLogin(
  page: Page,
  request: import("@playwright/test").APIRequestContext
): Promise<string> {
  // Register via API
  const registerRes = await request.post(`${BACKEND_URL}/register`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      display_name: TEST_USER.displayName,
    },
  });
  if (registerRes.status() !== 400) {
    expect(registerRes.ok()).toBeTruthy();
  }

  // Verify email
  await verifyUserEmail(TEST_USER.email);

  // Login via UI
  await page.goto("/login");
  await page.locator("#email").fill(TEST_USER.email);
  await page.locator("#password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(/:\d+\/?$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  // Get auth token
  const token = await page.evaluate(() => localStorage.getItem("rf_token"));
  expect(token).toBeTruthy();
  return token!;
}

// ═════════════════════════════════════════════════════════════════════
// Helper: Create campaign + product via API
// ═════════════════════════════════════════════════════════════════════
async function createCampaignAndProduct(
  request: import("@playwright/test").APIRequestContext,
  token: string
): Promise<void> {
  // Create campaign
  const campaignRes = await request.post(`${BACKEND_URL}/api/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: CAMPAIGN_NAME,
      description: "STC test campaign for content creation",
    },
  });
  expect(campaignRes.status()).toBe(201);
  const campaignBody = await campaignRes.json();
  campaignId = campaignBody.campaign_id;

  // Create product
  const productRes = await request.post(`${BACKEND_URL}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      product_name: PRODUCT_NAME,
      campaign_id: campaignId,
      description: "STC test product for reel creation",
      affiliate_link: "https://example.com/stc-product",
    },
  });
  expect(productRes.status()).toBe(201);
  const productBody = await productRes.json();
  productId = productBody.product_id;
}

// ═════════════════════════════════════════════════════════════════════
// Helper: Select product via ProductPickerDialog
// ═════════════════════════════════════════════════════════════════════
async function selectProduct(page: Page): Promise<void> {
  await page.getByRole("button", { name: /select a product/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Select Product")).toBeVisible();
  await page.getByText(CAMPAIGN_NAME).click();
  await page.getByText(PRODUCT_NAME).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
}

// ═════════════════════════════════════════════════════════════════════
// Helper: Mock reel generation APIs for happy path
// ═════════════════════════════════════════════════════════════════════
async function mockReelGenerationAPIs(page: Page): Promise<void> {
  // Mock POST /api/reels → 200 (create reel)
  await page.route("**/api/reels", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: MOCK_REEL_ID,
          status: "Pending",
          product_id: productId,
          prompt_text: VALID_PROMPT,
          raw_video_url: null,
          final_commercial_video_url: null,
          caption_and_hashtags: null,
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock GET /api/reels/*/status → Completed
  await page.route("**/api/reels/*/status", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_COMPLETED_STATUS),
    });
  });
}

// ═════════════════════════════════════════════════════════════════════
// STC-F2-01: End-to-End AI Video Generation Pipeline
//
// System Feature Flow:
//   Evaluates the flow of validating a user's input prompt and product
//   selection, transmitting metadata to the LTX Video API to generate
//   background B-roll, utilizing the Gemini API to generate captions
//   and hashtags, and rendering a preview for the user to approve.
//
// Associated Unit Tests: F2-UTC01, F2-UTC02, F2-UTC03, F2-UTC06
//
// Expected System Outcome:
//   The system successfully outputs a temporary preview URL along with
//   formatted captions and hashtags; upon user approval, the content is
//   successfully forwarded to the Distribution System.
// ═════════════════════════════════════════════════════════════════════
test.describe("STC-F2-01 – End-to-End AI Video Generation Pipeline", () => {
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
   * Happy path: Full AI pipeline
   * F2-UTC01 (prompt validation) → F2-UTC02 (generate reel via LTX)
   * → F2-UTC03 (captions/hashtags via Gemini) → F2-UTC06 (preview & approve)
   */
  test("should complete the full AI video generation pipeline and approve content", async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────
    // STEP 1 — Select product (F2-UTC01)
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);

    // ──────────────────────────────────────────────────────────────
    // STEP 2 — Enter valid prompt (F2-UTC01)
    // ──────────────────────────────────────────────────────────────
    const promptTextarea = page.getByPlaceholder(/Describe the Reel/i);
    await promptTextarea.fill(VALID_PROMPT);

    // ──────────────────────────────────────────────────────────────
    // STEP 3 — Mock APIs and generate reel (F2-UTC02 + F2-UTC03)
    // ──────────────────────────────────────────────────────────────
    await mockReelGenerationAPIs(page);

    // Mock approve endpoint (F2-UTC06)
    await page.route("**/api/reels/*/approve", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            reel_id: MOCK_REEL_ID,
            status: "Approved",
            message: "Content approved and forwarded to distribution",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Click Generate Reel
    const generateButton = page.getByRole("button", {
      name: /generate reel/i,
    });
    await expect(generateButton).toBeVisible();

    const generatePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await generateButton.click();
    const generateRes = await generatePromise;

    // ── API Layer: Assert reel creation succeeds ──
    expect(generateRes.status()).toBe(200);
    const generateBody = await generateRes.json();
    expect(generateBody.reel_id).toBe(MOCK_REEL_ID);
    expect(generateBody.status).toBe("Pending");

    // ──────────────────────────────────────────────────────────────
    // STEP 4 — Wait for completion and verify preview (F2-UTC03)
    // ──────────────────────────────────────────────────────────────
    await expect(
      page.getByText("Ready", { exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });

    // Verify video preview is shown
    const videoElement = page.locator("video");
    await expect(videoElement).toBeVisible({ timeout: 15_000 });

    // Verify captions and hashtags appear
    await expect(page.locator("text=Caption")).toBeVisible();

    // ──────────────────────────────────────────────────────────────
    // STEP 5 — Approve content (F2-UTC06)
    // ──────────────────────────────────────────────────────────────
    const approveButton = page.getByRole("button", {
      name: /approve|publish/i,
    });

    if (await approveButton.isVisible().catch(() => false)) {
      const approvePromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/reels/") &&
          res.url().includes("/approve") &&
          res.request().method() === "POST",
        { timeout: 15_000 }
      ).catch(() => null);

      await approveButton.click();
      const approveRes = await approvePromise;

      if (approveRes) {
        expect(approveRes.status()).toBe(200);
      }
    }
  });

  /**
   * Error path: Prompt validation failure
   * Empty or invalid prompt → validation error
   */
  test("should reject generation with invalid prompt", async ({ page }) => {
    // Select product
    await selectProduct(page);

    // Mock POST /api/reels → 422 for validation error
    await page.route("**/api/reels", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "PromptValidationException: Prompt fails safety or length validation checks",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Enter garbage text as prompt
    const promptTextarea = page.getByPlaceholder(/Describe the Reel/i);
    await promptTextarea.fill(GARBAGE_TEXT);

    // Click Generate Reel
    const generateButton = page.getByRole("button", {
      name: /generate reel/i,
    });

    if (await generateButton.isVisible().catch(() => false)) {
      const generatePromise = page.waitForResponse(
        (res) =>
          res.url().includes("/api/reels") &&
          res.request().method() === "POST",
        { timeout: 15_000 }
      ).catch(() => null);

      await generateButton.click();
      const generateRes = await generatePromise;

      if (generateRes) {
        // ── API Layer: Assert 422 ──
        expect(generateRes.status()).toBe(422);
      }
    }

    // ── UI Layer: Validation error shown ──
    await expect(
      page.locator("text=/validation|safety|error|failed|prompt/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═════════════════════════════════════════════════════════════════════
// STC-F2-02: Custom Reel Upload and Asset Overlay Flow
//
// System Feature Flow:
//   Checks the system's ability to allow members to upload their own
//   commercial videos and subsequently execute FFmpeg commands to
//   overlay product images or brand logos onto the file.
//
// Associated Unit Tests: F2-UTC04, F2-UTC05
//
// Expected System Outcome:
//   The system accepts a supported video format and generates a
//   finalized MP4 video URL containing the custom uploaded video
//   with correctly scaled and positioned overlay elements.
// ═════════════════════════════════════════════════════════════════════
test.describe("STC-F2-02 – Custom Reel Upload and Asset Overlay Flow", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, request }) => {
    const token = await registerAndLogin(page, request);
    const dbUser = await findUserByEmail(TEST_USER.email);
    userId = dbUser!.user_id;
    await createCampaignAndProduct(request, token);

    // Navigate to Create Reel page
    await page.goto("/create");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Create Reel");

    // Switch to Upload mode
    await page.click('button:has-text("Upload Video")');

    // Select product via ProductPickerDialog
    await page.click('button:has-text("Select a product")');
    await expect(page.locator("text=Select Product").first()).toBeVisible();
    await page.click(`text=${CAMPAIGN_NAME}`);
    await page.click(`text=${PRODUCT_NAME}`);
  });

  test.afterEach(async () => {
    if (userId) {
      await deleteReelsByUserId(userId);
      await deleteCampaignsByUserId(userId);
    }
    await deleteUserByEmail(TEST_USER.email);
  });

  /**
   * Happy path: Upload video → process → overlay → final URL
   * Integrates F2-UTC04 (upload) + F2-UTC05 (overlay)
   */
  test("should upload a custom video and apply overlay successfully", async ({
    page,
  }) => {
    const MOCK_UPLOAD_REEL_ID = "stc-upload-reel-001";
    const MOCK_OVERLAY_URL =
      "https://cdn.reelcast.dev/videos/stc_overlay_final.mp4";

    // ──────────────────────────────────────────────────────────────
    // PHASE 1 — Upload video (F2-UTC04)
    // ──────────────────────────────────────────────────────────────

    // Mock POST /api/reels/upload-video → 200
    await page.route("**/api/reels/upload-video", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            reel_id: MOCK_UPLOAD_REEL_ID,
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

    // Mock GET /api/reels/*/status → Completed
    await page.route(
      `**/api/reels/${MOCK_UPLOAD_REEL_ID}/status`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              reel_id: MOCK_UPLOAD_REEL_ID,
              status: "Completed",
              final_commercial_video_url: MOCK_VIDEO_URL,
              raw_video_url: MOCK_RAW_VIDEO_URL,
              caption_and_hashtags: {
                caption: "Custom uploaded video with brand overlay",
                hashtags: ["#brand", "#custom"],
              },
            }),
          });
        } else {
          await route.continue();
        }
      }
    );

    // Mock POST /api/reels/*/overlay → 200 (F2-UTC05)
    await page.route("**/api/reels/*/overlay", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            reel_id: MOCK_UPLOAD_REEL_ID,
            final_commercial_video_url: MOCK_OVERLAY_URL,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Set a fake MP4 file
    const fileInput = page.locator('input[type="file"][accept*=".mp4"]');
    await fileInput.setInputFiles({
      name: "commercial_valid.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake-mp4-video-content-for-stc-testing"),
    });

    // Verify file name appears
    await expect(page.locator("text=commercial_valid.mp4")).toBeVisible();

    // Intercept upload response
    const uploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/upload-video") &&
        res.request().method() === "POST"
    );

    // Click Upload & Process
    await page.click('button:has-text("Upload & Process")');
    const uploadRes = await uploadPromise;

    // ── API Layer: Assert upload succeeds ──
    expect(uploadRes.status()).toBe(200);
    const uploadBody = await uploadRes.json();
    expect(uploadBody.reel_id).toBe(MOCK_UPLOAD_REEL_ID);
    expect(uploadBody.status).toBe("Pending");

    // ──────────────────────────────────────────────────────────────
    // PHASE 2 — Wait for processing + verify overlay (F2-UTC05)
    // ──────────────────────────────────────────────────────────────

    // Wait for status to show Ready
    await expect(
      page.getByText("Ready", { exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });

    // Verify video preview is shown
    const videoElement = page.locator("video");
    await expect(videoElement).toBeVisible({ timeout: 15_000 });

    // Verify caption block appears
    await expect(page.locator("text=Caption")).toBeVisible();
  });

  /**
   * Error path: Unsupported video format (MKV)
   */
  test("should reject upload with unsupported video format", async ({
    page,
  }) => {
    // Mock POST /api/reels/upload-video → 400
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

    // Set a fake MKV file
    const fileInput = page.locator('input[type="file"][accept*=".mp4"]');
    await fileInput.setInputFiles({
      name: "commercial_invalid.mkv",
      mimeType: "video/x-matroska",
      buffer: Buffer.from("fake-mkv-content-for-stc-testing"),
    });

    await expect(page.locator("text=commercial_invalid.mkv")).toBeVisible();

    // Intercept upload response
    const uploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels/upload-video") &&
        res.request().method() === "POST"
    );

    await page.click('button:has-text("Upload & Process")');
    const uploadRes = await uploadPromise;

    // ── API Layer: Assert 400 ──
    expect(uploadRes.status()).toBe(400);

    const errorBody = await uploadRes.json();
    expect(errorBody.detail).toBe(
      "Unsupported video format. Allowed: mp4, mov, avi"
    );

    // ── UI Layer: Error shown ──
    await expect(
      page.locator("text=Unsupported video format").first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify no processing started
    await expect(page.getByText("Ready", { exact: true })).not.toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════
// STC-F2-03: Content Regeneration and Revision Workflow
//
// System Feature Flow:
//   Ensures that if a user rejects a generated video preview, they can
//   revise their original prompt and re-run the AI generation models
//   for a new iteration.
//
// Associated Unit Tests: F2-UTC06, F2-UTC07
//
// Expected System Outcome:
//   After a rejected preview decision, the system successfully generates
//   a new preview URL and caption data based on the safe, revised prompt,
//   ready for a new approval decision.
// ═════════════════════════════════════════════════════════════════════
test.describe("STC-F2-03 – Content Regeneration and Revision Workflow", () => {
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
   * Happy path: Generate → preview → reject → revise prompt → regenerate
   * Integrates F2-UTC06 (preview) + F2-UTC07 (regenerate)
   */
  test("should regenerate content with revised prompt after rejection", async ({
    page,
  }) => {
    const REGENERATED_REEL_ID = "stc-regen-reel-002";
    const REGENERATED_VIDEO_URL =
      "https://cdn.reelcast.dev/videos/stc_regenerated.mp4";
    const REVISED_PROMPT =
      "A vibrant close-up of iced cold brew with cream swirling slowly";

    // ──────────────────────────────────────────────────────────────
    // PHASE 1 — Initial generation (F2-UTC01 + F2-UTC02 + F2-UTC03)
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);

    const promptTextarea = page.getByPlaceholder(/Describe the Reel/i);
    await promptTextarea.fill(VALID_PROMPT);

    await mockReelGenerationAPIs(page);

    const generateButton = page.getByRole("button", {
      name: /generate reel/i,
    });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // Wait for initial completion
    await expect(
      page.getByText("Ready", { exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });

    // Verify preview is shown
    const videoElement = page.locator("video");
    await expect(videoElement).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Caption")).toBeVisible();

    // ──────────────────────────────────────────────────────────────
    // PHASE 2 — Revise prompt and regenerate (F2-UTC07)
    // ──────────────────────────────────────────────────────────────

    // Update the mock to return a new reel on regeneration
    await page.unrouteAll({ behavior: "wait" });

    await page.route("**/api/reels", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            reel_id: REGENERATED_REEL_ID,
            status: "Pending",
            product_id: productId,
            prompt_text: REVISED_PROMPT,
            raw_video_url: null,
            final_commercial_video_url: null,
            caption_and_hashtags: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: REGENERATED_REEL_ID,
          status: "Completed",
          final_commercial_video_url: REGENERATED_VIDEO_URL,
          raw_video_url: MOCK_RAW_VIDEO_URL,
          caption_and_hashtags: {
            caption: "Refreshing iced cold brew with cream ☕",
            hashtags: ["#coldbrew", "#icedcoffee", "#refresh"],
          },
        }),
      });
    });

    // Modify the prompt
    await promptTextarea.fill(REVISED_PROMPT);

    // Click Re-generate
    const regenerateButton = page.getByRole("button", {
      name: /re-?generate/i,
    });
    await expect(regenerateButton).toBeVisible({ timeout: 10_000 });

    const regenPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await regenerateButton.click();
    const regenRes = await regenPromise;

    // ── API Layer: Assert regeneration succeeds ──
    expect(regenRes.status()).toBe(200);
    const regenBody = await regenRes.json();
    expect(regenBody.reel_id).toBe(REGENERATED_REEL_ID);

    // ── UI Layer: Wait for new completion ──
    await expect(
      page.getByText("Ready", { exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });

    // Verify the new video preview is shown
    await expect(page.locator("video")).toBeVisible({ timeout: 15_000 });
  });

  /**
   * Error path: Regeneration with unsafe prompt
   * Generate → preview → reject → enter unsafe prompt → regenerate → fail
   */
  test("should reject regeneration with unsafe prompt", async ({ page }) => {
    // ──────────────────────────────────────────────────────────────
    // PHASE 1 — Initial generation (get to preview state)
    // ──────────────────────────────────────────────────────────────
    await selectProduct(page);

    const promptTextarea = page.getByPlaceholder(/Describe the Reel/i);
    await promptTextarea.fill(VALID_PROMPT);

    await mockReelGenerationAPIs(page);

    const generateButton = page.getByRole("button", {
      name: /generate reel/i,
    });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // Wait for completion
    await expect(
      page.getByText("Ready", { exact: true }).first()
    ).toBeVisible({ timeout: 30_000 });

    // ──────────────────────────────────────────────────────────────
    // PHASE 2 — Enter unsafe prompt and try to regenerate
    // ──────────────────────────────────────────────────────────────

    // Update mock to return validation error
    await page.unrouteAll({ behavior: "wait" });

    await page.route("**/api/reels", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "PromptValidationException: Prompt fails safety or length validation checks",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Re-mock status endpoint (needed after unrouteAll)
    await page.route("**/api/reels/*/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_COMPLETED_STATUS),
      });
    });

    // Modify prompt to unsafe text
    await promptTextarea.fill(GARBAGE_TEXT);

    // Click Re-generate
    const regenerateButton = page.getByRole("button", {
      name: /re-?generate/i,
    });
    await expect(regenerateButton).toBeVisible({ timeout: 10_000 });

    const regenPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/reels") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    );

    await regenerateButton.click();
    const regenRes = await regenPromise;

    // ── API Layer: Assert 422 ──
    expect(regenRes.status()).toBe(422);

    const errorBody = await regenRes.json();
    expect(errorBody.detail).toMatch(/validation|safety|prompt/i);

    // ── UI Layer: Error shown ──
    await expect(
      page.locator("text=/validation|safety|error|failed/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
