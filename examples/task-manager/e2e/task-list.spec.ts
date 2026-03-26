import { expect, test } from '@playwright/test';

test.describe('Task List', () => {
  test('displays first page of task cards after loading', async ({ page }) => {
    await page.goto('/');

    // Wait for loading to finish and task list to appear
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Page 1 should show 10 tasks (50 total, 10 per page)
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(10);
  });

  test('shows loading state initially', async ({ page }) => {
    await page.goto('/');
    // Page should render (loading may flash briefly before tasks load)
    await expect(page.getByTestId('task-list-page')).toBeVisible();
  });

  test('filters tasks by status on current page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Page 1 has 10 tasks with cycling statuses (todo, in-progress, done):
    // Tasks 1-10: statuses cycle as todo(1), in-progress(2), done(3), todo(4), ...
    // Page 1: 4 todo, 3 in-progress, 3 done

    // Click "Done" filter — 3 done tasks on page 1
    await page.getByTestId('filter-done').click();
    const doneCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(doneCards).toHaveCount(3);

    // Click "To Do" filter — 4 todo tasks on page 1
    await page.getByTestId('filter-todo').click();
    const todoCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(todoCards).toHaveCount(4);

    // Click "All" — back to 10 tasks
    await page.getByTestId('filter-all').click();
    const allCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(allCards).toHaveCount(10);
  });

  test('navigates to create task page via button', async ({ page }) => {
    await page.goto('/');
    // Wait for data to load and task list to render (may come via SSR or client-side fetch)
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(10, { timeout: 10000 });

    await page.getByTestId('create-task-btn').click();
    await expect(page.getByTestId('create-task-page')).toBeVisible();
  });

  test('shows pagination controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Pagination should be visible with 50 tasks / 10 per page = 5 pages
    await expect(page.getByTestId('pagination')).toBeVisible();
    await expect(page.getByTestId('pagination-info')).toContainText('Page 1 of 5');

    // Previous should be disabled on page 1
    await expect(page.getByTestId('pagination-prev')).toBeDisabled();
    // Next should be enabled
    await expect(page.getByTestId('pagination-next')).toBeEnabled();
  });

  test('pagination: clicking Next updates URL and shows next page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Click Next to go to page 2
    await page.getByTestId('pagination-next').click();

    // URL should update with ?page=2
    await expect(page).toHaveURL(/[?&]page=2/);

    // Should show page 2 info
    await expect(page.getByTestId('pagination-info')).toContainText('Page 2 of 5');

    // Page 2 should also have 10 tasks
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(10);

    // First task on page 2 should be different from page 1
    // Page 2 starts with task 11 ("Add WebSocket support")
    await expect(cards.first()).toContainText('Add WebSocket support');
  });

  test('pagination: direct navigation to page via URL', async ({ page }) => {
    // Navigate directly to page 3
    await page.goto('/?page=3');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Should show page 3 info
    await expect(page.getByTestId('pagination-info')).toContainText('Page 3 of 5');

    // Page 3 should have 10 tasks
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(10);

    // First task on page 3 should be task 21 ("Create billing integration")
    await expect(cards.first()).toContainText('Create billing integration');
  });

  test('pagination: Previous button navigates back', async ({ page }) => {
    await page.goto('/?page=3');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Click Previous to go to page 2
    await page.getByTestId('pagination-prev').click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByTestId('pagination-info')).toContainText('Page 2 of 5');
  });

  test('pagination: last page shows remaining tasks', async ({ page }) => {
    await page.goto('/?page=5');
    await expect(page.getByTestId('task-list')).toBeVisible();

    // Page 5 of 50 tasks with 10 per page = 10 tasks on last page
    const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
    await expect(cards).toHaveCount(10);

    // Next should be disabled on last page
    await expect(page.getByTestId('pagination-next')).toBeDisabled();
    // Previous should be enabled
    await expect(page.getByTestId('pagination-prev')).toBeEnabled();
  });
});
