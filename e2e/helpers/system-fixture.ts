import { createHmac } from "crypto";

import {
  APIRequestContext,
  expect,
  Page,
  TestInfo,
} from "@playwright/test";

import {
  deleteUserByEmail,
  verifyUserEmail,
} from "./db-helper";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export type SystemUser = {
  displayName: string;
  email: string;
  password: string;
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

export function systemUser(testInfo: TestInfo, prefix: string): SystemUser {
  const unique = `${Date.now()}.${testInfo.workerIndex}.${Math.random().toString(36).slice(2, 8)}`;
  return {
    displayName: `${prefix}_${testInfo.workerIndex}`,
    email: `${slug(prefix)}.${unique}@reelcast.dev`,
    password: "StrongPassword123!",
  };
}

export async function registerByApi(
  request: APIRequestContext,
  user: SystemUser,
) {
  await deleteUserByEmail(user.email);
  const response = await request.post(`${BACKEND_URL}/register`, {
    data: {
      email: user.email,
      password: user.password,
      display_name: user.displayName,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await verifyUserEmail(user.email);
}

export async function loginByUi(page: Page, user: SystemUser) {
  await page.goto("/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/$/);
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem("rf_token")),
  ).not.toBeNull();
}

export async function registerAndLogin(
  page: Page,
  request: APIRequestContext,
  user: SystemUser,
) {
  await registerByApi(request, user);
  await loginByUi(page, user);
}

export async function authToken(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem("rf_token") ?? "");
}

export async function createCampaignAndProduct(
  page: Page,
  request: APIRequestContext,
  names: { campaign: string; product: string },
) {
  const token = await authToken(page);
  const campaignResponse = await request.post(
    `${BACKEND_URL}/api/campaigns`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: names.campaign,
        description: "System test campaign",
        banner_color: "Twilight",
      },
    },
  );
  expect(campaignResponse.status(), await campaignResponse.text()).toBe(201);
  const campaign = await campaignResponse.json();

  const productResponse = await request.post(
    `${BACKEND_URL}/api/products`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        campaign_id: campaign.campaign_id,
        product_name: names.product,
        description: "Premium cold brew product",
        affiliate_link: "https://example.com/cold-brew",
      },
    },
  );
  expect(productResponse.status(), await productResponse.text()).toBe(201);
  return {
    campaign,
    product: await productResponse.json(),
  };
}

export async function selectSystemProduct(
  page: Page,
  campaignName: string,
  productName: string,
) {
  await page.getByRole("button", { name: /select a product/i }).click();
  await page.getByRole("button", { name: new RegExp(campaignName, "i") }).click();
  await page.getByRole("button", { name: new RegExp(productName, "i") }).click();
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(secret: string): Buffer {
  const bits = secret
    .replace(/=+$/g, "")
    .toUpperCase()
    .split("")
    .map((character) => BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, "0"))
    .join("");
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

export function totp(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  );
  return String(binary % 1_000_000).padStart(6, "0");
}
