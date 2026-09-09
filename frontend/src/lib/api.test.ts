import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  inputPromptAndSelectProduct,
  previewAndApproveContent,
  regenerateContent,
  uploadOwnReel,
} from "./api";

// UTC: F2-UTC01, F2-UTC04, F2-UTC06, F2-UTC07
// STC: STC-F2-01, STC-F2-02, STC-F2-03, STC-F2-05
describe("Reel API client", () => {
  beforeEach(() => {
    localStorage.setItem("rf_token", "test-token");
  });

  it("F2-UTC01 sends prompt and product payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reel_id: "reel-1", status: "Pending" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await inputPromptAndSelectProduct({
      prompt_text: "A cinematic cold brew video",
      product_id: "product-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/reels/generate"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prompt_text: "A cinematic cold brew video",
          product_id: "product-1",
        }),
      }),
    );
  });

  it("F2-UTC06 sends approval and rejection decisions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ approved: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await previewAndApproveContent("reel-1", true);
    await previewAndApproveContent("reel-1", false);

    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ decision: true }),
    );
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ decision: false }),
    );
  });

  it("F2-UTC07 sends revised prompt for regeneration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reel_id: "reel-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await regenerateContent("reel-1", "all", "Revised prompt");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/reels/reel-1/regenerate"),
      expect.objectContaining({
        body: JSON.stringify({
          target: "all",
          prompt_text: "Revised prompt",
        }),
      }),
    );
  });

  it("F2-UTC04 uploads the selected video with auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reel_id: "reel-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const file = new File(["video"], "commercial.mp4", {
      type: "video/mp4",
    });

    await uploadOwnReel(file, "product-1");

    const options = fetchMock.mock.calls[0][1];
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);
    expect(options?.headers).toEqual({
      Authorization: "Bearer test-token",
    });
  });

  it("throws when backend rejects a request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 400 }),
    );

    await expect(
      inputPromptAndSelectProduct({
        prompt_text: "",
        product_id: "product-1",
      }),
    ).rejects.toThrow("Failed to generate AI Reel");
  });

});
