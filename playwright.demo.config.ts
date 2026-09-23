import { defineConfig } from "@playwright/test";
/** Run against a separately seeded, explicitly configured synthetic test workspace. */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "demo-cases.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    actionTimeout: 20000,
    baseURL: process.env.DEMO_TEST_URL ?? "http://localhost:3104",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
});
