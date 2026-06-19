import { describe, expect, it } from "vitest";

import {
  MAX_PROFILE_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  buildGuidedPromptPayload,
  getProductStatus,
  hasGuidedSelection,
  sortLibraryItems,
  validateLoginForm,
  validateOtpCode,
  validateProductImages,
  validateProfileImage,
  validatePrompt,
  validateRegistrationForm,
  validateVideoFile,
} from "./test-plan";

describe("F1 frontend unit tests", () => {
  it("F1-UTC01-TC01 accepts valid registration input", () => {
    expect(
      validateRegistrationForm({
        displayName: "JohnDoe",
        email: "johndoe@example.com",
        password: "StrongPassword123!",
        confirmPassword: "StrongPassword123!",
        acceptTerms: true,
      }),
    ).toBeNull();
  });

  it("F1-UTC01-TC02 rejects invalid email format", () => {
    expect(
      validateRegistrationForm({
        displayName: "JohnDoe",
        email: "johndoe-example",
        password: "StrongPassword123!",
        confirmPassword: "StrongPassword123!",
        acceptTerms: true,
      }),
    ).toBe("Invalid email format");
  });

  it("F1-UTC01-TC03 rejects weak password", () => {
    expect(
      validateRegistrationForm({
        displayName: "JohnDoe",
        email: "johndoe@example.com",
        password: "weak",
        confirmPassword: "weak",
        acceptTerms: true,
      }),
    ).toMatch(/Password must include/);
  });

  it("F1-UTC02 validates login fields", () => {
    expect(validateLoginForm("user@domain.com", "ValidPass123")).toBeNull();
    expect(validateLoginForm("", "")).toBe("Please fill in all fields");
  });

  it("F1-UTC04 validates six-digit TOTP", () => {
    expect(validateOtpCode("123456")).toBeNull();
    expect(validateOtpCode("00000a")).toMatch(/6-digit/);
    expect(validateOtpCode("")).toMatch(/6-digit/);
  });

  it("F1-UTC03 accepts JPG/PNG under 2MB", () => {
    expect(
      validateProfileImage({
        name: "profile_valid.jpg",
        size: 1.5 * 1024 * 1024,
      }),
    ).toBeNull();
  });

  it("F1-UTC03 rejects GIF and files over 2MB", () => {
    expect(
      validateProfileImage({ name: "profile_invalid.gif", size: 100 }),
    ).toMatch(/Invalid file type/);
    expect(
      validateProfileImage({
        name: "profile_oversize.png",
        size: MAX_PROFILE_IMAGE_BYTES + 1,
      }),
    ).toMatch(/2MB/);
  });
});

describe("F2 frontend unit tests", () => {
  it("F2-UTC01 validates prompt boundaries", () => {
    expect(validatePrompt("A cinematic cold brew video")).toBeNull();
    expect(validatePrompt("")).toMatch(/cannot be empty/);
    expect(validatePrompt("x".repeat(501))).toMatch(/500/);
  });

  it("F2-UTC08 accepts full and partial Guide Me selections", () => {
    expect(
      hasGuidedSelection({
        focus: "Cafe morning",
        target: "Coffee lovers",
        mood: "Calm",
        lighting: "Natural",
        style: "Cinematic",
        cameraMotion: "Slow pan",
      }),
    ).toBe(true);
    expect(
      hasGuidedSelection({
        focus: "Cafe morning",
        target: "Coffee lovers",
        mood: "Calm",
      }),
    ).toBe(true);
    expect(hasGuidedSelection({ focus: null, mood: undefined })).toBe(false);
  });

  it("F2-UTC08 builds the backend guided-prompt payload", () => {
    expect(
      buildGuidedPromptPayload(
        {
          focus: "Cafe morning",
          target: "Coffee lovers",
          mood: "Calm",
          cameraMotion: "Slow pan",
        },
        "product-id",
        30,
      ),
    ).toEqual({
      mood: "Calm",
      target: "Coffee lovers",
      style: undefined,
      focus: "Cafe morning",
      lighting: undefined,
      camera_motion: "Slow pan",
      product_id: "product-id",
      duration: 30,
    });
  });

  it("F2-UTC04 accepts MP4, MOV, AVI", () => {
    for (const name of ["commercial.mp4", "commercial.mov", "commercial.avi"]) {
      expect(
        validateVideoFile({ name, size: 100 * 1024 * 1024 }, 45),
      ).toBeNull();
    }
  });

  it("F2-UTC04 rejects MKV, oversized, and long videos", () => {
    expect(
      validateVideoFile({ name: "commercial.mkv", size: 100 }, 45),
    ).toMatch(/Unsupported/);
    expect(
      validateVideoFile(
        { name: "commercial.mp4", size: MAX_VIDEO_BYTES + 1 },
        45,
      ),
    ).toMatch(/500MB/);
    expect(
      validateVideoFile({ name: "commercial.mp4", size: 100 }, 61),
    ).toMatch(/60-second/);
  });
});

describe("F4 frontend unit tests", () => {
  it("F4-UTC02 validates product image count and formats", () => {
    expect(
      validateProductImages([
        { name: "photo1.jpg", size: 10 },
        { name: "photo2.png", size: 10 },
        { name: "photo3.webp", size: 10 },
      ]),
    ).toBeNull();
    expect(
      validateProductImages(
        Array.from({ length: 6 }, (_, index) => ({
          name: `photo${index}.jpg`,
          size: 10,
        })),
      ),
    ).toMatch(/Maximum 5/);
    expect(
      validateProductImages([{ name: "photo.pdf", size: 10 }]),
    ).toMatch(/JPG, PNG, or WEBP/);
  });

  it("F4-UTC02 computes Active and Draft status", () => {
    expect(
      getProductStatus({
        productName: "Cold Brew Kit",
        description: "Description",
        affiliateLink: "https://example.com",
        imageCount: 1,
      }),
    ).toBe("Active");
    expect(
      getProductStatus({
        productName: "",
        description: "",
        affiliateLink: "",
        imageCount: 0,
      }),
    ).toBe("Draft");
  });

  it("F4-UTC03 sorts library records without mutating input", () => {
    const items = [
      {
        name: "Winter",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-03T00:00:00Z",
      },
      {
        name: "Cold Brew",
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ];
    expect(sortLibraryItems(items, "name").map((item) => item.name)).toEqual([
      "Cold Brew",
      "Winter",
    ]);
    expect(sortLibraryItems(items, "newest")[0].name).toBe("Cold Brew");
    expect(items[0].name).toBe("Winter");
  });
});
