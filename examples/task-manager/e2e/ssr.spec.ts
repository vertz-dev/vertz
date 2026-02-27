import { expect, test } from '@playwright/test';

// SSR tests must run serially — concurrent SSR requests to the dev server
// share module-level state (document global) and can interfere with each other.
test.describe.configure({ mode: 'serial' });

test.describe('SSR — Server-Side Rendering', () => {
  test.describe('initial page load', () => {
    test('SSR renders task list with pre-fetched data — no loading flash', async ({
      page,
      request,
    }) => {
      // Fetch raw HTML from server to verify SSR output
      const response = await request.get('/', {
        headers: { accept: 'text/html' },
      });
      const html = await response.text();

      // Server should pre-render the task list page with actual data
      expect(html).toContain('data-testid="task-list-page"');
      expect(html).toContain('data-testid="task-list"');
      // Should contain actual task titles — not a loading state
      expect(html).toContain('Set up CI/CD pipeline');
      expect(html).toContain('Implement user authentication');
      expect(html).toContain('Write API documentation');

      // Now load in browser and verify no loading flash
      await page.goto('/');
      await expect(page.getByTestId('task-list')).toBeVisible();
      const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(cards).toHaveCount(3);
    });

    test('SSR injects __VERTZ_SSR_DATA__ for client hydration', async ({ request }) => {
      const response = await request.get('/', {
        headers: { accept: 'text/html' },
      });
      const html = await response.text();

      expect(html).toContain('__VERTZ_SSR_DATA__');
      // SSR data should contain the query key
      expect(html).toContain('task-list');
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

    test('SSR renders task detail page with pre-fetched data', async ({ request }) => {
      // Get a real task ID from the API
      const listRes = await request.get('/api/tasks');
      const listBody = await listRes.json();
      const task = listBody.data.find((t: { title: string }) => t.title.includes('CI/CD'));
      expect(task).toBeDefined();

      const response = await request.get(`/tasks/${task.id}`, {
        headers: { accept: 'text/html' },
      });
      const html = await response.text();

      expect(html).toContain('data-testid="task-detail-page"');
      // Should contain the task title — pre-fetched, not loading
      expect(html).toContain('Set up CI/CD pipeline');
    });
  });

  test.describe('no-JS progressive enhancement', () => {
    test('task list page renders with JavaScript disabled', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.goto('/');

      // SSR output should be visible without JS
      await expect(page.getByTestId('task-list-page')).toBeVisible();
      // Task data should be pre-rendered
      const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(cards).toHaveCount(3);

      await context.close();
    });

    test('task detail page renders with JavaScript disabled', async ({ browser, request }) => {
      // Get a real task ID from the API
      const listRes = await request.get('/api/tasks');
      const listBody = await listRes.json();
      const taskId = listBody.data[0].id;

      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.goto(`/tasks/${taskId}`);

      await expect(page.getByTestId('task-detail-page')).toBeVisible();
      // Task title should be visible
      await expect(page.getByTestId('task-title')).toBeVisible();

      await context.close();
    });
  });

  test.describe('client-side hydration', () => {
    test('no loading indicator visible on SSR hydrated page', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('task-list')).toBeVisible();

      // Loading indicator should not be visible — SSR data was hydrated
      const loadingIndicator = page.locator('text=Loading tasks');
      await expect(loadingIndicator).not.toBeVisible();
    });

    test('interactivity works after SSR hydration', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('task-list')).toBeVisible();

      // Client-side filtering should work after hydration
      await page.getByTestId('filter-done').click();
      const doneCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(doneCards).toHaveCount(1);

      // Go back to all
      await page.getByTestId('filter-all').click();
      const allCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
      await expect(allCards).toHaveCount(3);
    });

    test('client-side navigation to detail page works after SSR', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('task-list')).toBeVisible();

      // Click a task card to navigate
      await page.getByTestId('task-list').locator('[data-testid^="task-card-"]').first().click();
      await expect(page.getByTestId('task-detail-page')).toBeVisible();
      await expect(page.getByTestId('task-title')).toBeVisible();
    });
  });
});
