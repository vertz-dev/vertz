import { test, expect } from '@playwright/test';

test.describe('Counter reactivity', () => {
  test('Dashboard: Page Views counter increments on click', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });

    // Vertz compiler renders reactive values in <span style="display:contents">
    // so text renders as "Page Views:0" (no space before the reactive value)
    await expect(page.getByText(/Page Views:\s*0/)).toBeVisible();

    // Use a value-independent locator so it survives counter updates
    const counterWrapper = page.locator('div', { has: page.getByText(/Page Views:/) });
    const plusButton = counterWrapper.getByRole('button', { name: '+' });

    await plusButton.click();
    await expect(page.getByText(/Page Views:\s*1/)).toBeVisible();

    await plusButton.click();
    await expect(page.getByText(/Page Views:\s*2/)).toBeVisible();
  });

  test('Dashboard Settings: Saves counter increments on click', async ({ page }) => {
    await page.goto('/dashboard/settings', { waitUntil: 'load' });

    await expect(page.getByText(/Saves:\s*0/)).toBeVisible();

    // Use a value-independent locator so it survives counter updates
    const counterWrapper = page.locator('div', { has: page.getByText(/Saves:/) });
    const plusButton = counterWrapper.getByRole('button', { name: '+' });

    await plusButton.click();
    await expect(page.getByText(/Saves:\s*1/)).toBeVisible();

    await plusButton.click();
    await expect(page.getByText(/Saves:\s*2/)).toBeVisible();
  });
});
