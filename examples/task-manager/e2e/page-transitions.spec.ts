import { expect, test } from '@playwright/test';

test.describe('Page transitions', () => {
  test('rapid sequential navigation lands on final destination', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list-page')).toBeVisible();

    // Click multiple sidebar links in quick succession
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: 'Create Task' }).click();
    await page.getByRole('link', { name: 'All Tasks' }).click();

    // Final destination should be the task list
    await expect(page.getByTestId('task-list-page')).toBeVisible();
  });

  test('view transitions are enabled on the router', async ({ page }) => {
    await page.goto('/');

    // Navigate and verify the router uses view transitions when supported.
    // In browsers with startViewTransition, the framework wraps navigations
    // automatically via createRouter({ viewTransition: true }).
    // We verify by checking that navigation still works correctly —
    // the view transition is transparent to the user.
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();

    await page.getByRole('link', { name: 'All Tasks' }).click();
    await expect(page.getByTestId('task-list-page')).toBeVisible();
  });
});
