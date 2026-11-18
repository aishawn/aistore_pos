import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["junit", { outputFile: "test-results/e2e-junit.xml" }],
  ],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: "3107",
      NEXT_PUBLIC_TENANT_SCHEME: "http",
    },
  },
});
