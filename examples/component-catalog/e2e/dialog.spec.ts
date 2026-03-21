import { expect, test } from '@playwright/test';

test.describe('Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dialog');
    // Wait for first button to be ready
    await page.getByText('Edit Profile').waitFor();
  });

  test('renders dialog trigger buttons', async ({ page }) => {
    await expect(page.getByText('Edit Profile')).toBeVisible();
    await expect(page.getByText('Share')).toBeVisible();
    await expect(page.getByText('View Details')).toBeVisible();
  });

  test('clicking button opens dialog via DialogStack', async ({ page }) => {
    await page.getByText('Edit Profile').click();

    const dialog = page.locator('dialog[data-dialog-wrapper][data-state="open"]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
  });

  test('dialog content is visible when open', async ({ page }) => {
    await page.getByText('Edit Profile').click();

    const panel = page.locator('dialog[data-dialog-wrapper] [data-part="panel"]');
    await expect(panel).toContainText('Edit profile');
    await expect(panel).toContainText('Make changes to your profile');
  });

  test('Escape key dismisses dialog', async ({ page }) => {
    await page.getByText('Edit Profile').click();
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(page.locator('dialog[data-dialog-wrapper][data-state="open"]')).toHaveCount(0);
  });

  test('Cancel button closes dialog', async ({ page }) => {
    await page.getByText('Edit Profile').click();
    await page.waitForTimeout(200);

    await page.locator('[data-part="panel"] [data-part="cancel"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('dialog[data-dialog-wrapper][data-state="open"]')).toHaveCount(0);
  });
});
