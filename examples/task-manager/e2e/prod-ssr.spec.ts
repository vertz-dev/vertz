import { expect, test } from '@playwright/test';

/**
 * Production SSR E2E tests.
 *
 * These tests verify the production build works end-to-end.
 * They require the production server to be running on port 3000:
 *   bun run build:all && bun run start
 *
 * Run with: PROD_SSR=1 npx playwright test e2e/prod-ssr.spec.ts
 */

// Skip if not explicitly running production tests
const PROD_BASE = 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

test.describe('Production SSR', () => {
  test.skip(!process.env.PROD_SSR, 'Set PROD_SSR=1 to run production tests');

  test('SSR initial load renders pre-rendered task list', async ({ page }) => {
    // Navigate to root
    const response = await page.goto(PROD_BASE);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');

    // Page should contain pre-rendered content (not empty <div id="app">)
    await expect(page.getByTestId('task-list-page')).toBeVisible();
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Task cards should be pre-rendered via SSR
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(3);
  });

  test('static assets served with correct headers', async ({ page }) => {
    await page.goto(PROD_BASE);

    // Check that CSS is loaded
    const cssResponse = await page.request.get(`${PROD_BASE}/assets/vertz.css`);
    expect(cssResponse.status()).toBe(200);
    expect(cssResponse.headers()['content-type']).toContain('text/css');
  });

  test('nav pre-fetch works — detail page renders without loading flash', async ({ page }) => {
    await page.goto(PROD_BASE);
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Monitor network for nav prefetch request
    const navRequestPromise = page.waitForRequest((req) => req.headers()['x-vertz-nav'] === '1', {
      timeout: 5000,
    });

    // Click a task card to navigate to detail
    await page.getByTestId('task-list').locator('[data-testid^="task-card-"]').first().click();

    // Verify the nav prefetch request was sent
    const navRequest = await navRequestPromise;
    expect(navRequest.url()).toContain('/tasks/');

    // Detail page should render with pre-fetched data
    await expect(page.getByTestId('task-detail-page')).toBeVisible();
    await expect(page.getByTestId('task-title')).toBeVisible();
  });

  test('reverse navigation works — detail to list', async ({ page }) => {
    // Load detail page via SSR
    await page.goto(`${PROD_BASE}/tasks/1`);
    await expect(page.getByTestId('task-detail-page')).toBeVisible();

    // Click "Back to Tasks" to navigate client-side
    await page.getByRole('button', { name: 'Back to Tasks' }).click();

    // List page should render with data
    await expect(page.getByTestId('task-list-page')).toBeVisible();
    await expect(page.getByTestId('task-list')).toBeVisible();
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(3);
  });

  test('hydration works — interactive elements respond to clicks', async ({ page }) => {
    await page.goto(PROD_BASE);
    await expect(page.getByTestId('task-list-page')).toBeVisible();

    // Click a filter button — verifies hydration wired up event handlers
    await page.getByTestId('filter-done').click();

    // Should filter to only "Done" tasks
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    // At least one card should still be visible (the "Done" task)
    await expect(cards.first()).toBeVisible();
  });
});
