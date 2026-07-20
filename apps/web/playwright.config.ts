import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90000, // 90s timeout to allow for Next.js compilation/cold starts
  expect: {
    timeout: 10000,
  },
  fullyParallel: false, // Run sequentially to avoid DB lock/race issues on local SQLite/Postgres
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    extraHTTPHeaders: {
      "x-playwright-test": "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
