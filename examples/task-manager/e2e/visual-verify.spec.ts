import { expect, test } from '@playwright/test';

async function getFirstTaskId(page: import('@playwright/test').Page): Promise<string> {
  const response = await page.request.get('/api/tasks');
  const body = await response.json();
  return body.data[0].id;
}

test.describe('Visual Verification — Bug Fixes', () => {
  test('dialog: opens centered with overlay, closes properly', async ({ page }) => {
    const taskId = await getFirstTaskId(page);
    await page.goto(`/tasks/${taskId}`);
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
    const taskId = await getFirstTaskId(page);
    await page.goto(`/tasks/${taskId}`);
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
