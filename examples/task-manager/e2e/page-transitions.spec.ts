import { expect, test } from '@playwright/test';

test.describe('Page transitions', () => {
  test('content changes on sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list-page')).toBeVisible();

    // Navigate to settings via sidebar
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('task-list-page')).toBeHidden();
  });

  test('back navigation restores previous page content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('task-list-page')).toBeVisible();

    // Navigate to settings
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();

    // Go back via browser history
    await page.goBack();
    await expect(page.getByTestId('task-list-page')).toBeVisible();
  });

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

  test('view transition CSS is injected', async ({ page }) => {
    await page.goto('/');

    // Verify the view transition keyframes are present in the document styles
    const hasViewTransitionStyles = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.includes('fade-out') || rule.cssText.includes('fade-in')) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheets throw SecurityError — skip them
        }
      }
      return false;
    });

    expect(hasViewTransitionStyles).toBe(true);
  });
});
