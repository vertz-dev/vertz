import { expect, test } from '@playwright/test';
test.describe('Task Lifecycle', () => {
    test('view task detail from list', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('task-list')).toBeVisible();
        // Click the first task card
        await page.getByTestId('task-list').locator('[data-testid^="task-card-"]').first().click();
        // Should show task detail with title and description
        await expect(page.getByTestId('task-detail-page')).toBeVisible();
        await expect(page.getByTestId('task-content')).toBeVisible();
        await expect(page.getByTestId('task-title')).not.toBeEmpty();
        await expect(page.getByTestId('task-description')).not.toBeEmpty();
    });
    test('transition task status: todo → in-progress', async ({ page }) => {
        // Task 3 (API docs) is "todo"
        await page.goto('/tasks/3');
        await expect(page.getByTestId('task-content')).toBeVisible();
        // Status bar should show "To Do" badge and "Start" button
        const statusBar = page.getByTestId('status-bar');
        await expect(statusBar).toContainText('To Do');
        await expect(statusBar.getByRole('button', { name: 'Start' })).toBeVisible();
        // Click "Start" to transition to in-progress
        await statusBar.getByRole('button', { name: 'Start' }).click();
        // After revalidation, should show "In Progress" and new buttons
        await expect(statusBar).toContainText('In Progress');
        await expect(statusBar.getByRole('button', { name: 'Complete' })).toBeVisible();
    });
    test('transition task status: in-progress → done', async ({ page }) => {
        // Task 2 (user auth) is "in-progress"
        await page.goto('/tasks/2');
        await expect(page.getByTestId('task-content')).toBeVisible();
        const statusBar = page.getByTestId('status-bar');
        await expect(statusBar).toContainText('In Progress');
        // Click "Complete"
        await statusBar.getByRole('button', { name: 'Complete' }).click();
        await expect(statusBar).toContainText('Done');
        await expect(statusBar.getByRole('button', { name: 'Reopen' })).toBeVisible();
    });
    test('create a new task via form', async ({ page }) => {
        await page.goto('/tasks/new');
        await expect(page.getByTestId('create-task-page')).toBeVisible();
        // Fill in the form — inputs use id attributes, not data-testid
        await page.fill('#task-title', 'New E2E Task');
        await page.fill('#task-description', 'Created during E2E testing');
        await page.selectOption('#task-priority', 'high');
        // Submit
        await page.getByTestId('submit-task').click();
        // Should navigate back to task list after creation
        await expect(page.getByTestId('task-list-page')).toBeVisible();
        // The new task should appear in the list
        await expect(page.getByTestId('task-list')).toContainText('New E2E Task');
    });
    test('delete a task with confirmation dialog', async ({ page }) => {
        await page.goto('/tasks/1');
        await expect(page.getByTestId('task-content')).toBeVisible();
        await expect(page.getByTestId('task-title')).toContainText('CI/CD');
        // Click the delete trigger button to open the confirmation dialog
        await page.getByTestId('confirm-dialog-trigger').click();
        // Confirmation dialog should appear
        const dialog = page.getByTestId('confirm-dialog-content');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Are you sure');
        // Confirm deletion
        await page.getByTestId('confirm-action').click();
        // Should navigate back to task list
        await expect(page.getByTestId('task-list-page')).toBeVisible();
        // The deleted task should no longer appear
        await expect(page.getByTestId('task-list')).not.toContainText('CI/CD pipeline');
    });
    test('cancel delete dialog does not delete the task', async ({ page }) => {
        await page.goto('/tasks/1');
        await expect(page.getByTestId('task-content')).toBeVisible();
        // Open delete dialog
        await page.getByTestId('confirm-dialog-trigger').click();
        await expect(page.getByTestId('confirm-dialog-content')).toBeVisible();
        // Cancel — the close button has aria-label="Close" (from Dialog primitive)
        // but textContent="Cancel" (set by ConfirmDialog component)
        await page.getByTestId('confirm-dialog-content').getByRole('button', { name: 'Close' }).click();
        // Dialog should close (data-state="closed", aria-hidden="true")
        await expect(page.getByTestId('confirm-dialog-content')).toHaveAttribute('data-state', 'closed');
        // Task should still be there
        await expect(page.getByTestId('task-content')).toBeVisible();
    });
    test('tabs on task detail page switch content', async ({ page }) => {
        await page.goto('/tasks/1');
        await expect(page.getByTestId('task-content')).toBeVisible();
        // Details tab should be active by default
        await expect(page.getByTestId('task-description')).toBeVisible();
        // Click Activity tab
        await page.getByRole('tab', { name: 'Activity' }).click();
        await expect(page.getByText('No activity yet')).toBeVisible();
        // Click back to Details tab
        await page.getByRole('tab', { name: 'Details' }).click();
        await expect(page.getByTestId('task-description')).toBeVisible();
    });
});
//# sourceMappingURL=task-lifecycle.spec.js.map