import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("API origins", () => {
  it("uses the deployment origin for API and media while keeping OAuth configurable", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.reelcast.test/api/");
    vi.stubEnv("NEXT_PUBLIC_OAUTH_API_URL", "https://oauth.reelcast.test/api/");
    vi.resetModules();
    const config = await import("./api-config");
    const { resolveVideoUrl } = await import("./reel-status");
    expect(config.API_BASE_URL).toBe("https://api.reelcast.test/api");
    expect(config.BACKEND_BASE_URL).toBe("https://api.reelcast.test");
    expect(config.OAUTH_BACKEND_URL).toBe("https://oauth.reelcast.test");
    expect(resolveVideoUrl("videos/reel.mp4")).toBe("https://api.reelcast.test/api/upload/videos/videos/reel.mp4");
    expect(resolveVideoUrl("https://cdn.test/reel.mp4")).toBe("https://cdn.test/reel.mp4");
  });

  it("supports same-origin API paths", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/");
    vi.stubEnv("NEXT_PUBLIC_OAUTH_API_URL", "");
    vi.resetModules();
    const config = await import("./api-config");
    expect(config.BACKEND_BASE_URL).toBe("");
    expect(config.OAUTH_API_BASE_URL).toBe("/api");
  });
});
