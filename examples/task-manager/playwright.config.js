import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        headless: true,
    },
    webServer: {
        command: 'bun run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 15_000,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
//# sourceMappingURL=playwright.config.js.map