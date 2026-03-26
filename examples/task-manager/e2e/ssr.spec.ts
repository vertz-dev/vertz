import { expect, test } from '@playwright/test';

// SSR tests must run serially — concurrent SSR requests to the dev server
// share module-level state (document global) and can interfere with each other.
test.describe.configure({ mode: 'serial' });

test.describe('SSR — Server-Side Rendering', () => {
  test.describe('initial page load', () => {
    test('SSR renders page structure with task list layout', async ({ request }) => {
      const response = await request.get('/', {
        headers: { accept: 'text/html' },
      });
      const html = await response.text();

      // Server should always pre-render the page structure
      expect(html).toContain('data-testid="task-list-page"');
    });

    test('task list data loads — via SSR pre-fetch or client-side fetch', async ({ page }) => {
      await page.goto('/');

      // Task cards should appear — either pre-rendered by SSR or loaded client-side
      // Page 1 shows 10 tasks (50 total, 10 per page)
      const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(cards).toHaveCount(10, { timeout: 10000 });

      // First few task titles should be visible on page 1
      await expect(page.getByText('Set up CI/CD pipeline')).toBeVisible();
      await expect(page.getByText('Implement user authentication')).toBeVisible();
      await expect(page.getByText('Write API documentation')).toBeVisible();
    });

    test('SSR injects theme CSS custom properties in head', async ({ request }) => {
      const response = await request.get('/', {
        headers: { accept: 'text/html' },
      });
      const html = await response.text();

      expect(html).toContain('data-vertz-css');
      expect(html).toContain('--color-primary');
      expect(html).toContain('--color-background');
    });

    test('task detail page loads with data', async ({ page }) => {
      await page.goto('/tasks/1');
      await expect(page.getByTestId('task-detail-page')).toBeVisible();
      // Task title should appear — either SSR pre-fetched or client-side loaded
      await expect(page.getByTestId('task-title')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('no-JS progressive enhancement', () => {
    test('task list page structure renders with JavaScript disabled', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.goto('/');

      // SSR output should be visible without JS
      await expect(page.getByTestId('task-list-page')).toBeVisible();

      await context.close();
    });

    test('task detail page structure renders with JavaScript disabled', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.goto('/tasks/1');

      await expect(page.getByTestId('task-detail-page')).toBeVisible();

      await context.close();
    });
  });

  test.describe('client-side hydration', () => {
    test('task list loads and becomes interactive', async ({ page }) => {
      await page.goto('/');
      const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(cards).toHaveCount(10, { timeout: 10000 });

      // Client-side filtering should work after hydration
      // Page 1 has 3 done tasks (cycling statuses across 10 items)
      await page.getByTestId('filter-done').click();
      const doneCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(doneCards).toHaveCount(3);

      // Go back to all
      await page.getByTestId('filter-all').click();
      const allCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(allCards).toHaveCount(10);
    });

    test('client-side navigation to detail page works after SSR', async ({ page }) => {
      await page.goto('/');
      const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(cards).toHaveCount(10, { timeout: 10000 });

      // Click a task card to navigate
      await page.getByTestId('task-list').locator('[data-testid^="task-card-"]').first().click();
      await expect(page.getByTestId('task-detail-page')).toBeVisible();
      await expect(page.getByTestId('task-title')).toBeVisible();
    });
  });
});
