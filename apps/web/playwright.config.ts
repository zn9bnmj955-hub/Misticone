import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Same environment as the app (apps/web/.env.local): keys are never written in tests.
loadEnvConfig(__dirname);

/**
 * End-to-end tests. Requires the local Supabase stack (`pnpm db:start`) with
 * the demo seed. The dev server is started automatically if not running.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
