import { expect, Page } from "@playwright/test";

export const UI_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@reelcast.dev",
  display_name: "ReelCast Member",
  is_email_verified: true,
  is_2fa_enabled: false,
  profile_image: null,
  created_at: "2026-06-01T00:00:00Z",
};

export const UI_LIBRARY = {
  campaigns: [
    {
      campaign_id: "22222222-2222-4222-8222-222222222222",
      name: "Summer 2026",
      description: "Summer campaign",
      banner_color: "Twilight",
      banner_image_url: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    },
  ],
  products: [
    {
      product_id: "33333333-3333-4333-8333-333333333333",
      campaign_id: "22222222-2222-4222-8222-222222222222",
      product_name: "Cold Brew Kit",
      description: "Premium cold brew coffee maker",
      affiliate_link: "https://example.com/cold-brew",
      brand_logo_url: null,
      status: "Active",
      images: [
        {
          image_id: "44444444-4444-4444-8444-444444444444",
          image_url: "products/cold-brew.jpg",
          is_primary: true,
        },
      ],
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    },
  ],
  total: 1,
};

export async function mockAuthenticatedUser(
  page: Page,
  overrides: Record<string, unknown> = {},
) {
  const user = { ...UI_USER, ...overrides };
  await page.addInitScript(() => {
    localStorage.setItem("rf_token", "ui-unit-token");
  });
  await page.route("**/me", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(user),
      });
      return;
    }
    await route.continue();
  });
  return user;
}

export async function mockLibrary(
  page: Page,
  library = UI_LIBRARY,
) {
  await page.route("**/api/library", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(library),
    });
  });
}

export async function selectColdBrewProduct(page: Page) {
  await page.getByRole("button", { name: /select a product/i }).click();
  await page.getByRole("button", { name: /Summer 2026/i }).click();
  await page.getByRole("button", { name: /Cold Brew Kit/i }).click();
  await expect(page.getByText("Cold Brew Kit").first()).toBeVisible();
}
