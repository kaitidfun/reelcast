import { expect, test } from "@playwright/test";

// UTC: F2-UTC01, F2-UTC02, F2-UTC08, F2-UTC09, F2-UTC10
// STC: STC-F2-01, STC-F2-02

import {
  mockAuthenticatedUser,
  mockLibrary,
  selectColdBrewProduct,
} from "../../helpers/ui-mocks";

test.describe("UI unit: F2 prompt assembly and media", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
    await mockLibrary(page);
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create Reel" })).toBeVisible();
    await selectColdBrewProduct(page);
  });

  test("F2-UTC08-TC01 and TC02 build prompts from full or partial Guide Me input", async ({ page }) => {
    let requestBody: Record<string, unknown> = {};
    await page.route("**/api/reels/generate-guided-prompt", async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prompt: "A calm cafe scene with a slow pan." }),
      });
    });

    await page.getByRole("button", { name: /Guide Me/i }).click();
    await page.getByRole("button", { name: "Unboxing" }).click();
    await page.getByRole("button", { name: "Working Adults" }).click();
    await page.getByRole("button", { name: "Cute & Warm" }).click();
    await page.getByRole("button", { name: /Auto-Build Prompt/i }).click();

    await expect(page.getByPlaceholder(/Prompt will be auto-built/i)).toHaveValue(
      "A calm cafe scene with a slow pan.",
    );
    expect(requestBody.product_id).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(requestBody.focus).toBe("Unboxing");
  });

  test("F2-UTC08-TC04 shows Gemini failure", async ({ page }) => {
    await page.route("**/api/reels/generate-guided-prompt", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "GeminiAPIException" }),
      });
    });

    await page.getByRole("button", { name: /Guide Me/i }).click();
    await page.getByRole("button", { name: "Unboxing" }).click();
    await page.getByRole("button", { name: /Auto-Build Prompt/i }).click();

    await expect(
      page.getByText("Could not build prompt", { exact: true }).first(),
    ).toBeVisible();
  });

  test("F2-UTC09-TC01 enhances a raw prompt", async ({ page }) => {
    await page.route("**/api/reels/enhance-prompt", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prompt: "Enhanced cinematic cold brew prompt" }),
      });
    });

    const prompt = page.getByPlaceholder(/Describe the Reel/i);
    await prompt.fill("Cold brew coffee video");
    await page.getByRole("button", { name: /^enhance$/i }).click();

    await expect(prompt).toHaveValue("Enhanced cinematic cold brew prompt");
  });

  test("F2-UTC09-TC02 rejects empty prompt before API call", async ({ page }) => {
    await page.getByRole("button", { name: /^enhance$/i }).click();
    await expect(
      page.getByText("Add a prompt first", { exact: true }).first(),
    ).toBeVisible();
  });

  test("F2-UTC10-TC01 applies a prompt template", async ({ page }) => {
    await page.route("**/api/reels/generate-prompt", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prompt: "Flash sale ends tonight" }),
      });
    });

    await page.getByRole("button", { name: /Flash Sale/i }).click();
    await expect(page.getByPlaceholder(/Describe the Reel/i)).toHaveValue(
      "Flash sale ends tonight",
    );
  });

  test("F2-UTC01 and F2-UTC02 render a completed generated Reel", async ({ page }) => {
    await page.route("**/api/reels/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "55555555-5555-4555-8555-555555555555",
          status: "Pending",
          prompt_text: "A cinematic cold brew video",
        }),
      });
    });
    await page.route("**/api/reels/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "55555555-5555-4555-8555-555555555555",
          status: "Completed",
          prompt_text: "A cinematic cold brew video",
          final_commercial_video_url: "https://example.com/final.mp4",
          raw_video_url: "https://example.com/raw.mp4",
          caption_and_hashtags: {
            caption: "Cold brew for every morning",
            hashtags: ["#coffee", "#coldbrew"],
          },
        }),
      });
    });

    await page.getByPlaceholder(/Describe the Reel/i).fill(
      "A cinematic cold brew video",
    );
    await page.getByRole("button", { name: /Generate Video/i }).click();

    await expect(page.getByText("Ready", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("video")).toBeVisible();
  });

  test("F2-UTC02-TC02 displays provider failure", async ({ page }) => {
    await page.route("**/api/reels/generate", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "LTXVideoAPIException: provider unavailable",
        }),
      });
    });

    await page.getByPlaceholder(/Describe the Reel/i).fill("A cinematic video");
    await page.getByRole("button", { name: /Generate Video/i }).click();

    await expect(
      page.getByText(/LTXVideoAPIException/).first(),
    ).toBeVisible();
  });

  test("uploaded Reel can be retried when server processing fails", async ({ page }) => {
    await page.route("**/api/reels/upload-video", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "66666666-6666-4666-8666-666666666666",
          status: "Pending",
          prompt_text: "",
        }),
      });
    });
    await page.route("**/api/reels/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reel_id: "66666666-6666-4666-8666-666666666666",
          status: "Failed",
          prompt_text: "",
          error_message: "Processing failed",
        }),
      });
    });

    await page.getByRole("button", { name: "Upload Video" }).click();
    await page.locator('input[type="file"][accept*=".mp4"]').setInputFiles({
      name: "commercial.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("invalid-video"),
    });
    await page.getByRole("button", { name: /Upload & Process/i }).click();

    await expect(
      page.getByText("Generation Failed", { exact: true }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /Upload & Process/i }),
    ).toBeEnabled();
  });
});
