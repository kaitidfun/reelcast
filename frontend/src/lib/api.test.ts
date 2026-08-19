import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  inputPromptAndSelectProduct,
  previewAndApproveContent,
  regenerateContent,
  uploadOwnReel,
  fetchTrackingDashboard,
  fetchTrackingAnalysis,
  syncTrackingData,
} from "./api";

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

  it("F5-UTC05 loads the real tracking dashboard with authentication", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ totals: {}, trend: [] }), { status: 200 }),
    );

    await fetchTrackingDashboard();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tracking/dashboard"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });

  it("F5-UTC06 sends the selected tracking date range", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ totals: {}, trend: [] }), { status: 200 }),
    );

    await fetchTrackingDashboard({ start: "2026-08-01", end: "2026-08-17" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tracking/dashboard?start=2026-08-01&end=2026-08-17"),
      expect.anything(),
    );
  });

  it("F5-UTC06 sends the selected performance analysis criteria", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: [], trend: [] }), { status: 200 }),
    );

    await fetchTrackingAnalysis({ level: "reel", metric: "engagement", platform: "instagram" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tracking/analysis?level=reel&metric=engagement&platform=instagram"),
      expect.anything(),
    );
  });

  it("F5-UTC03 can request a tracking synchronization", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ synced_accounts: 1 }), { status: 200 }),
    );

    await syncTrackingData();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tracking/sync"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
