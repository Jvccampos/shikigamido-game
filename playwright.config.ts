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
        command: "npm run build && NODE_ENV=test npm start",
        url: `${baseURL}/healthz`,
        env: {
          PORT: "3187",
          NODE_ENV: "production",
          DATABASE_PATH: ":memory:",
          PUBLIC_URL: baseURL,
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
        },
        reuseExistingServer: false,
        timeout: 120000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      },
});
