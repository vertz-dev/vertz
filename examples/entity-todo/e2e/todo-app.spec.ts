import { expect, test } from '@playwright/test';

test.describe('Todo App — Hydration & Interactivity', () => {
  test('page loads with SSR content and becomes interactive', async ({ page }) => {
    await page.goto('/');
    // Page should render (SSR)
    await expect(page.getByTestId('todo-list-page')).toBeVisible();
    // Wait for data to load (queryMatch resolves to data state)
    await expect(page.getByTestId('todo-list').or(page.getByText('No todos yet'))).toBeVisible({
      timeout: 10000,
    });
  });

  test('create a new todo via form submission', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('todo-list-page')).toBeVisible();
    // Wait for initial data load
    await expect(page.getByTestId('todo-list').or(page.getByText('No todos yet'))).toBeVisible({
      timeout: 10000,
    });

    // Count existing todos
    const initialCount = await page
      .getByTestId('todo-list')
      .locator('[data-testid^="todo-item-"]')
      .count()
      .catch(() => 0);

    // Fill in the form and submit
    const uniqueTitle = `E2E Todo ${Date.now()}`;
    await page.getByTestId('todo-title-input').fill(uniqueTitle);
    await page.getByTestId('submit-todo').click();

    // New todo should appear in the list (use title testid to avoid matching delete dialog text)
    await expect(
      page.locator('[data-testid^="todo-title-"]', { hasText: uniqueTitle }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('toggle todo completion via checkbox', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('todo-list')).toBeVisible({ timeout: 10000 });

    // Find the first todo item's checkbox
    const firstItem = page.getByTestId('todo-list').locator('[data-testid^="todo-item-"]').first();
    await expect(firstItem).toBeVisible();
    const checkbox = firstItem.locator('[data-testid^="todo-checkbox-"]');

    // Get initial state
    const wasChecked = await checkbox.isChecked();

    // Get the title span to verify class changes (strikethrough)
    const titleSpan = firstItem.locator('[data-testid^="todo-title-"]');
    const initialClass = await titleSpan.getAttribute('class');

    // Click to toggle
    await checkbox.click();

    // Verify toggled (optimistic update should be immediate)
    if (wasChecked) {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    }

    // Verify the title class updated (strikethrough style changes with completion)
    await expect(titleSpan).not.toHaveAttribute('class', initialClass!, { timeout: 5000 });
  });

  test('delete dialog opens and closes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('todo-list')).toBeVisible({ timeout: 10000 });

    // Click delete on the first todo
    const firstDeleteBtn = page
      .getByTestId('todo-list')
      .locator('[data-testid^="todo-delete-"]')
      .first();
    await firstDeleteBtn.click();

    // Dialog should open
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText('Delete todo?');

    // Cancel the dialog
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('delete todo with confirmation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('todo-list')).toBeVisible({ timeout: 10000 });

    // First, create a todo to delete (so we don't depend on existing data)
    const uniqueTitle = `Delete Me ${Date.now()}`;
    await page.getByTestId('todo-title-input').fill(uniqueTitle);
    await page.getByTestId('submit-todo').click();
    await expect(
      page.locator('[data-testid^="todo-title-"]', { hasText: uniqueTitle }),
    ).toBeVisible({ timeout: 10000 });

    // Find the delete button for our newly created todo
    const todoItem = page.locator('[data-testid^="todo-item-"]', {
      has: page.locator('[data-testid^="todo-title-"]', { hasText: uniqueTitle }),
    });
    const deleteBtn = todoItem.locator('[data-testid^="todo-delete-"]');
    await deleteBtn.click();

    // Confirm deletion
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // Todo should be removed from the list
    await expect(
      page.locator('[data-testid^="todo-title-"]', { hasText: uniqueTitle }),
    ).not.toBeVisible({ timeout: 10000 });
  });
});
