import { beforeEach, describe, expect, it } from "vitest";

import { PLATFORM_OPTIONS, buildSocialConnectionUrl, platformLabel } from "./platforms";

describe("F3 frontend platform helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("F3-UTC01 exposes exactly the supported social platforms", () => {
    expect(PLATFORM_OPTIONS.map((platform) => platform.name)).toEqual([
      "youtube", "tiktok", "facebook", "instagram",
    ]);
    expect(platformLabel("tiktok")).toBe("TikTok");
    expect(platformLabel("youtube")).toBe("YouTube Shorts");
  });

  it("F3-UTC01 builds the OAuth URL with the member token and return path", () => {
    expect(buildSocialConnectionUrl("tiktok", "member-token", "/create/publish?reelId=reel-1")).toMatch(
      /\/social\/tiktok\/connect\?token=member-token&return_to=%2Fcreate%2Fpublish%3FreelId%3Dreel-1$/,
    );
  });

  it("F3-UTC01 omits the optional return path when none is supplied", () => {
    expect(buildSocialConnectionUrl("youtube", "member-token")).toMatch(
      /\/social\/youtube\/connect\?token=member-token$/,
    );
  });
});
