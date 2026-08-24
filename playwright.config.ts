import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Safari renders WebGL, audio autoplay and touch differently from Chrome,
    // and "works in Chrome, broken in Safari" is a documented rejection cause.
    // Testing it in CI is the only way we catch that without owning a Mac.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // A real mobile viewport with touch, since most portal traffic is mobile.
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],

  // Tests run against the built artifact, not the dev server — dev builds hide
  // minification and asset-path bugs that only appear in production.
  webServer: {
    command: 'pnpm --filter @ucgames/game-template preview --port 4173 --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
