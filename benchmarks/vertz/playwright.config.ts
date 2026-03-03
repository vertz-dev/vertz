import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
    headless: true,
  },

  webServer: {
    command: 'bun node_modules/@vertz/cli/dist/vertz.js dev --port 4201',
    url: 'http://localhost:4201',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
