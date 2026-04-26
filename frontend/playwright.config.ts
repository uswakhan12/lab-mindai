import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";
const managedWebServer = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      port: 4173,
      reuseExistingServer: true,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    headless: true,
  },
  webServer: managedWebServer,
});
