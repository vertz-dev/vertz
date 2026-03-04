import { expect, test } from '@playwright/test';

test.describe('Routing', () => {
  test('renders task list at root URL', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list-page')).toBeVisible();
  });

  test('renders create task page at /tasks/new', async ({ page }) => {
    await page.goto('/tasks/new');
    await expect(page.getByTestId('create-task-page')).toBeVisible();
  });

  test('renders task detail page at /tasks/:id', async ({ page }) => {
    await page.goto('/tasks/1');
    await expect(page.getByTestId('task-detail-page')).toBeVisible();
    await expect(page.getByTestId('task-content')).toBeVisible();
  });

  test('renders settings page at /settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('sidebar links point to correct routes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list-page')).toBeVisible();

    // Verify sidebar link hrefs point to the expected routes
    const settingsHref = await page.getByRole('link', { name: 'Settings' }).getAttribute('href');
    expect(settingsHref).toBe('/settings');

    const createHref = await page.getByRole('link', { name: 'Create Task' }).getAttribute('href');
    expect(createHref).toBe('/tasks/new');

    const allTasksHref = await page.getByRole('link', { name: 'All Tasks' }).getAttribute('href');
    expect(allTasksHref).toBe('/');
  });

  test('navigating to a task and back preserves the list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Click a task card to navigate to detail
    await page.getByTestId('task-list').locator('[data-testid^="task-card-"]').first().click();
    await expect(page.getByTestId('task-detail-page')).toBeVisible();

    // Click "Back to Tasks"
    await page.getByRole('button', { name: 'Back to Tasks' }).click();
    await expect(page.getByTestId('task-list')).toBeVisible();
  });

  test('shows not-found for unknown routes', async ({ page }) => {
    await page.goto('/some/nonexistent/page');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});
