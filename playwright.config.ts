import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-Tests der wichtigsten Abläufe (Ordner e2e/). Der Server (Supabase)
 * wird in den Tests komplett nachgestellt – sie berühren nie echte Daten.
 * Lokal: `bunx playwright test` (startet den Entwicklungsserver selbst).
 */
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "handy", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `bunx vite dev --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
