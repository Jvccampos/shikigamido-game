import { defineConfig } from "@playwright/test";
const baseURL = process.env.TEST_URL || "http://127.0.0.1:3187";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: ".sited/playwright-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".sited/playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
    screenshot: "only-on-failure",
    launchOptions: { args: ["--no-sandbox"] },
  },
  webServer: process.env.TEST_URL
    ? undefined
    : {
        command: `rm -rf .sited/wrangler && npm run build && npx wrangler dev --port 3187 --var PUBLIC_URL:${baseURL} --persist-to .sited/wrangler`,
        url: `${baseURL}/healthz`,
        reuseExistingServer: false,
        timeout: 120000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      },
});
