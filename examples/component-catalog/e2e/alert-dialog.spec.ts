import { expect, test } from '@playwright/test';

test.describe('Confirm Dialog (via DialogStack)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/alert-dialog');
    await page.getByText('Delete Account').waitFor();
  });

  test('renders delete button', async ({ page }) => {
    await expect(page.getByText('Delete Account')).toBeVisible();
  });

  test('clicking button opens confirm dialog', async ({ page }) => {
    await page.getByText('Delete Account').click();

    const dialog = page.locator('dialog[data-dialog-wrapper][data-state="open"]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Are you absolutely sure?');
    await expect(dialog).toContainText('This action cannot be undone');
  });

  test('cancel button closes confirm dialog', async ({ page }) => {
    await page.getByText('Delete Account').click();
    await page.waitForTimeout(200);

    await page.locator('[data-part="confirm-cancel"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('dialog[data-dialog-wrapper][data-state="open"]')).toHaveCount(0);
  });

  test('confirm button closes dialog', async ({ page }) => {
    await page.getByText('Delete Account').click();
    await page.waitForTimeout(200);

    await page.locator('[data-part="confirm-action"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('dialog[data-dialog-wrapper][data-state="open"]')).toHaveCount(0);
  });

  test('confirm dialog is non-dismissible by default (Escape does not close)', async ({ page }) => {
    await page.getByText('Delete Account').click();
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Should still be open — confirm dialogs are non-dismissible by default
    const dialog = page.locator('dialog[data-dialog-wrapper][data-state="open"]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
  });
});
