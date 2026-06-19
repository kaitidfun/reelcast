import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: process.cwd(),
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    clearMocks: true,
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "./src") },
  },
});
