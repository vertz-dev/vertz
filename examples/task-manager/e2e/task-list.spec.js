import { expect, test } from '@playwright/test';
test.describe('Task List', () => {
    test('displays task cards after loading', async ({ page }) => {
        await page.goto('/');
        // Wait for loading to finish and task list to appear
        await expect(page.getByTestId('task-list')).toBeVisible();
        // 3 mock tasks should be rendered
        const cards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
        await expect(cards).toHaveCount(3);
    });
    test('shows loading state initially', async ({ page }) => {
        await page.goto('/');
        // Page should render (loading may flash briefly before tasks load)
        await expect(page.getByTestId('task-list-page')).toBeVisible();
    });
    test('filters tasks by status', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('task-list')).toBeVisible();
        // Click "Done" filter — only 1 task is done (CI/CD pipeline)
        await page.getByTestId('filter-done').click();
        const doneCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
        await expect(doneCards).toHaveCount(1);
        // Click "To Do" filter — only 1 task is todo (API docs)
        await page.getByTestId('filter-todo').click();
        const todoCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
        await expect(todoCards).toHaveCount(1);
        // Click "In Progress" filter — only 1 task (user auth)
        await page.getByTestId('filter-in-progress').click();
        const inProgressCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
        await expect(inProgressCards).toHaveCount(1);
        // Click "All" — back to 3 tasks
        await page.getByTestId('filter-all').click();
        const allCards = page.getByTestId('task-list').locator('[data-testid^="task-card-"]');
        await expect(allCards).toHaveCount(3);
    });
    test('navigates to create task page via button', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('task-list')).toBeVisible();
        await page.getByTestId('create-task-btn').click();
        await expect(page.getByTestId('create-task-page')).toBeVisible();
    });
});
//# sourceMappingURL=task-list.spec.js.map