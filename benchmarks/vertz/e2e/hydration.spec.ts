import { test, expect } from '@playwright/test';

test.describe('Hydration correctness', () => {
  test('Dashboard has exactly 4 stat cards (no duplication)', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });

    // Verify exactly 4 stat labels
    const labels = ['Total Users', 'Revenue', 'Orders', 'Conversion'];
    for (const label of labels) {
      const elements = page.getByText(label, { exact: true });
      await expect(elements).toHaveCount(1);
    }
  });

  test('Dashboard stat values match expected content', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });

    await expect(page.getByText('12,345')).toBeVisible();
    await expect(page.getByText('$98,765')).toBeVisible();
    await expect(page.getByText('3,456')).toBeVisible();
    await expect(page.getByText('3.2%')).toBeVisible();
  });

  test('Counter is present and functional after hydration', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });

    // Vertz compiler renders reactive values without space: "Page Views:0"
    const counterText = page.getByText(/Page Views:\s*0/);
    await expect(counterText).toBeVisible();

    // Counter should be interactive (hydration completed)
    const counterWrapper = page.locator('div', { has: counterText });
    const plusButton = counterWrapper.getByRole('button', { name: '+' });
    await plusButton.click();

    await expect(page.getByText(/Page Views:\s*1/)).toBeVisible();
  });
});
