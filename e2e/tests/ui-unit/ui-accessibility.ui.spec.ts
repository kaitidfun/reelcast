import { expect, test } from "@playwright/test";
import { mockAuthenticatedUser, mockLibrary, UI_LIBRARY } from "../../helpers/ui-mocks";

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedUser(page);
  await mockLibrary(page);
});

for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test(`campaign dialog stays usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/library");
    await page.getByRole("button", { name: /New Campaign/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Wait for the dialog's entrance animation before measuring its bounds.
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= viewport.height;
    }).toBe(true);
    const name = page.getByLabel("Campaign Name");
    await name.fill("Mobile campaign");
    await page.getByLabel("Description", { exact: true }).fill("A campaign created on a small screen");
    const save = dialog.getByRole("button", { name: "Create Campaign", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeInViewport();
    await expect(dialog.getByRole("heading", { name: "New Campaign" })).toBeInViewport();
    await close.click();
    await expect(dialog).toBeHidden();
  });
}

test("mobile navigation has named open and visible close controls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/library");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(drawer).toBeHidden();
});

test("desktop edit becomes visible on keyboard focus without hover", async ({ page }) => {
  await page.goto(`/library?campaign=${UI_LIBRARY.campaigns[0].campaign_id}`);
  const edit = page.getByRole("button", { name: "Edit product", exact: true });
  await expect(edit).toHaveCSS("opacity", "0");
  await edit.focus();
  await expect(edit).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Edit Product");
});

test("product edit is discoverable on touch screens without hover", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await mockAuthenticatedUser(page);
    await mockLibrary(page);
    await page.goto(`/library?campaign=${UI_LIBRARY.campaigns[0].campaign_id}`);
    const edit = page.getByRole("button", { name: "Edit product", exact: true });
    await expect(edit).toHaveCSS("opacity", "1");
    await edit.tap();
    await expect(page.getByRole("dialog")).toContainText("Edit Product");
    await expect(page).toHaveURL(/\/library\?campaign=/);
  } finally {
    await context.close();
  }
});
