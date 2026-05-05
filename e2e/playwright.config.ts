import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Load test-specific environment variables
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,          // Run sequentially — tests share DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                    // Single worker to avoid race conditions on shared DB
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  timeout: 60_000,               // 60 s per test (registration sends email)
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
