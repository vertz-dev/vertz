import { expect, test } from '@playwright/test';

test.describe('Visual Verification — Bug Fixes', () => {
  test('dialog: opens centered with overlay, closes properly', async ({ page }) => {
    await page.goto('/tasks/1');
    await expect(page.getByTestId('task-content')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/fix-01-before-dialog.png', fullPage: true });

    // Open dialog
    await page.getByTestId('confirm-dialog-trigger').click();
    await expect(page.getByTestId('confirm-dialog-content')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/fix-02-dialog-open.png', fullPage: true });

    // Cancel dialog
    await page.getByTestId('confirm-dialog-content').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('confirm-dialog-content')).toHaveAttribute(
      'data-state',
      'closed',
    );
    await page.screenshot({ path: 'e2e/screenshots/fix-03-dialog-closed.png', fullPage: true });
  });

  test('tabs: only active panel visible', async ({ page }) => {
    await page.goto('/tasks/1');
    await expect(page.getByTestId('task-content')).toBeVisible();

    // Details tab should be visible, Activity panel hidden
    await expect(page.getByTestId('task-description')).toBeVisible();
    const activityText = page.getByText('No activity yet');
    await expect(activityText).toBeHidden();
    await page.screenshot({ path: 'e2e/screenshots/fix-04-tabs-details.png', fullPage: true });

    // Switch to Activity tab
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(activityText).toBeVisible();
    await expect(page.getByTestId('task-description')).toBeHidden();
    await page.screenshot({ path: 'e2e/screenshots/fix-05-tabs-activity.png', fullPage: true });
  });
});
