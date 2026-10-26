import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedUser, UI_LIBRARY } from "../../helpers/ui-mocks";

const longName = "สินค้าProduct".repeat(18);
const campaignId = UI_LIBRARY.campaigns[0].campaign_id;
const productId = UI_LIBRARY.products[0].product_id;
const library = {
  campaigns: [{ ...UI_LIBRARY.campaigns[0], name: longName, description: longName }],
  products: [{ ...UI_LIBRARY.products[0], product_name: longName, description: longName, images: [], reel_count: 1 }], total: 1,
};
const reel = { reel_id: "reel-1", name: longName, prompt_text: longName, status: "Completed", has_distribution: true, created_at: "2026-10-01T00:00:00Z" };
const distribution = { distribution_id: "distribution-1", reel_id: "reel-1", account_id: "account-1", platform_name: "youtube", status: "Failed", error_message: longName, reel_name: longName, reel_prompt: longName, created_at: "2026-10-01T00:00:00Z", retry_count: 0 };

async function setup(page: Page) {
  await mockAuthenticatedUser(page, { display_name: "Creator".repeat(7), email: `${"creator".repeat(18)}@example.com` });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path === "/api/library") data = library;
    else if (path === `/api/products/${productId}`) data = library.products[0];
    else if (path === `/api/campaigns/${campaignId}`) data = library.campaigns[0];
    else if (path === "/api/reels") data = { reels: [reel], total: 1 };
    else if (path === "/api/social/accounts") data = { accounts: [{ account_id: "account-1", platform_name: "youtube" }], total: 1 };
    else if (path === "/api/social/readiness") data = { platforms: {} };
    else if (path.includes("recent-campaigns")) data = { campaign_ids: [campaignId], total: 1 };
    else if (path.endsWith("/products")) data = { product_ids: [productId] };
    else if (path.includes("distributions")) data = { distributions: [distribution], total: 1 };
    return route.fulfill({ json: data });
  });
}

const routes = [
  ["/", "Welcome back,"],
  ["/account", "Account"],
  ["/library", "Campaigns & Products"],
  [`/library?campaign=${campaignId}`, longName],
  [`/library/product/${productId}`, longName],
  ["/reels", "Reels"],
  ["/distribute", "Distribution"],
  [`/distribute/campaign/${campaignId}`, longName],
  [`/distribute/product/${productId}`, longName],
  ["/distribute/reel-1", longName],
];

for (const width of [375, 1440]) {
  test(`login contains long server errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/login", route => route.request().method() === "POST"
      ? route.fulfill({ status: 401, json: { detail: longName } }) : route.continue());
    await page.goto("/login");
    await page.locator("#email").fill("creator@example.com");
    await page.locator("#password").fill("StrongPassword123!");
    await page.getByRole("button", { name: /sign in/i, exact: true }).click();
    const error = page.getByText(longName, { exact: true });
    await expect(error).toBeVisible();
    expect(await error.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const bounds = await error.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  });

  test(`campaign preview and error toast contain long text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.route("**/api/campaigns", route => route.fulfill({ status: 500, json: { detail: longName } }));
    await page.goto("/library");
    await page.getByRole("button", { name: "New Campaign", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await page.getByLabel("Campaign Name").fill(longName);
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Create Campaign", exact: true }).click();
    // Radix marks content outside the open modal aria-hidden, including this toast viewport.
    const notifications = page.locator('[role="region"][aria-label="Notifications (F8)"]');
    const message = notifications.getByText(longName, { exact: true });
    await expect(message).toBeVisible();
    const bounds = await message.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await message.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });

  for (const [path, heading] of routes) {
    test(`${path} contains long text at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setup(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: heading })).toBeVisible();
      // Measure content as well as the page: the dashboard hides horizontal overflow.
      await expect.poll(() => page.locator("main").evaluate(main => main.scrollWidth - main.clientWidth)).toBeLessThanOrEqual(1);
      const overflowingText = await page.locator("main h1, main h2, main h3, main nav[aria-label=breadcrumb] a, main nav[aria-label=breadcrumb] [aria-current=page]").evaluateAll(elements => elements.filter(element => {
        const style = getComputedStyle(element);
        return style.overflowX === "visible" && element.scrollWidth > element.clientWidth + 1;
      }).map(element => element.textContent?.slice(0, 50)));
      expect(overflowingText).toEqual([]);
      const selects = page.getByRole("combobox");
      for (let index = 0; index < await selects.count(); index++) {
        await selects.nth(index).click();
        const popup = page.getByRole("listbox");
        await expect(popup).toBeVisible();
        await expect.poll(async () => {
          const box = await popup.boundingBox();
          return !!box && box.x >= 0 && box.x + box.width <= width;
        }).toBe(true);
        await popup.getByRole("option").last().click();
        await expect(selects.nth(index).locator(":scope > svg")).toHaveCSS("width", "16px");
      }
    });
  }

  test(`product picker contains long campaign and product names at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/create");
    await page.getByRole("button", { name: /Select a product/i }).click();
    const dialog = page.getByRole("dialog");
    const campaign = dialog.getByRole("button", { name: new RegExp(longName) }).first();
    await expect(campaign).toBeVisible();
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await campaign.click();
    await dialog.getByRole("button", { name: new RegExp(longName) }).last().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(longName, { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.locator("main").evaluate(main => main.scrollWidth - main.clientWidth)).toBeLessThanOrEqual(1);
  });
}
