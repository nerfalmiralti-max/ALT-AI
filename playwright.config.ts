import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.ALT_QR_E2E_MANAGED ? undefined : [
    { command: "node node_modules/next/dist/bin/next dev -p 3100", url: "http://127.0.0.1:3100", timeout: 120_000, reuseExistingServer: false, env: { ...process.env, ALT_QR_DATA_DIR: ".alt-qr-data/e2e", ALT_QR_ALLOW_PRIVATE_TARGETS: "true", ALT_QR_CHALLENGE_MAX_PAGES: "1" } },
    { command: "node node_modules/tsx/dist/cli.mjs tests/fixtures/standalone.ts", url: "http://127.0.0.1:4173/good", timeout: 30_000, reuseExistingServer: false, env: { ...process.env, FIXTURE_PORT: "4173", CANDIDATE_FIXTURE_PORT: "4174" } },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
