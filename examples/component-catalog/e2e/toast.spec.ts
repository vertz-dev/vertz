import { expect, test } from '@playwright/test';

test.describe('Toast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/toast');
    await page.getByRole('button', { name: 'Show Toast' }).waitFor();
  });

  test('renders the Show Toast button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Show Toast' });
    await expect(button).toBeVisible();
  });

  test('clicking Show Toast displays a notification', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Show Toast' });
    await button.click();

    // Toast messages use data-toast-id attribute
    const toast = page.locator('[data-toast-id]');
    await expect(toast.first()).toBeVisible({ timeout: 3000 });
    await expect(toast.first()).toContainText('Event has been created');
  });

  test('toast region has proper ARIA attributes', async ({ page }) => {
    // The toast region should exist with aria-live for accessibility
    const region = page.locator('[aria-live="polite"]');
    await expect(region.first()).toBeAttached();
  });

  test('multiple clicks show multiple toasts', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Show Toast' });

    await button.click();
    // Wait for first toast to appear
    await expect(page.locator('[data-toast-id]').first()).toBeVisible({ timeout: 3000 });

    await button.click();

    // Should have 2 toast messages
    const toasts = page.locator('[data-toast-id]');
    await expect(toasts).toHaveCount(2, { timeout: 3000 });
  });
});
