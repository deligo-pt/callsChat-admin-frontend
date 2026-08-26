import { defineConfig, devices } from '@playwright/test'

/*
 * Deliberately NOT 5173.
 *
 * The e2e server runs on its own port so it never collides with a developer's
 * dev server, and so a run can never accidentally reuse one that is pointed at
 * the real backend.
 */
const PORT = 5174
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? 'github' : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Responsive matrix from plan.md §6.3 — 360 / 768 / 1024 / 1440 / 1920
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'laptop-1024',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'wide-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    /*
     * The e2e suite runs against the MOCK backend, always.
     *
     * `.env.development` points dev at the real API so a developer signing in
     * with real credentials gets real behaviour — but these tests assert on
     * seeded data (500 users) and invented accounts, and running them against
     * production would be both wrong and destructive: several of them sign out,
     * and Phase 3C will add suspend/ban.
     *
     * Vite's `loadEnv` reads prefixed `process.env` as well as `.env*` files,
     * and process values win — so this pins the mode regardless of what is on
     * the developer's machine.
     */
    env: {
      VITE_USE_MOCKS: 'true',
      VITE_API_BASE_URL: 'http://localhost:4000',
      VITE_ENV_LABEL: 'local',
    },
    // A dev server left running against the real API would silently poison the run.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
