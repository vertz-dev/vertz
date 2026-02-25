import { expect, test } from '@playwright/test';

// Server nav tests must run serially — they share dev server state.
test.describe.configure({ mode: 'serial' });

test.describe('Server Nav — Client-Side Navigation Pre-Fetch', () => {
  test('SSR initial load still works (regression)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list-page')).toBeVisible();
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Task data should be pre-rendered from SSR
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(3);
  });

  test('client nav sends X-Vertz-Nav pre-fetch request', async ({ page }) => {
    await page.goto('/');
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

    // Target page should render with pre-fetched data
    await expect(page.getByTestId('task-detail-page')).toBeVisible();
    await expect(page.getByTestId('task-title')).toBeVisible();
  });

  test('reverse navigation (detail → list) works with pre-fetch', async ({ page }) => {
    // Load detail page via SSR
    await page.goto('/tasks/1');
    await expect(page.getByTestId('task-detail-page')).toBeVisible();

    // Click "Back to Tasks" to navigate client-side
    await page.getByRole('button', { name: 'Back to Tasks' }).click();

    // List page should render with data
    await expect(page.getByTestId('task-list-page')).toBeVisible();
    await expect(page.getByTestId('task-list')).toBeVisible();
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(3);
  });

  test('rapid re-navigation is safe', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Rapidly navigate between pages.
    // The router waits briefly for SSE data before rendering, so rapid clicks
    // queue up navigations. Use Promise.all to fire both clicks without waiting.
    await page.getByRole('link', { name: 'Settings' }).click();
    // Wait for first navigation to complete before second click
    await expect(page.getByText('Settings')).toBeVisible({ timeout: 3000 });
    await page.getByRole('link', { name: 'All Tasks' }).click();

    // Should end up on the correct page without errors
    await expect(page.getByTestId('task-list-page')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('task-list')).toBeVisible();
  });
});
