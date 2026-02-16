import { expect, test } from '@playwright/test';
test.describe('Settings', () => {
    test('renders settings page with theme cards', async ({ page }) => {
        await page.goto('/settings');
        await expect(page.getByTestId('settings-page')).toBeVisible();
        await expect(page.getByTestId('theme-light')).toBeVisible();
        await expect(page.getByTestId('theme-dark')).toBeVisible();
    });
    test('switches to dark theme', async ({ page }) => {
        await page.goto('/settings');
        await expect(page.getByTestId('settings-page')).toBeVisible();
        // Click dark theme card
        await page.getByTestId('theme-dark').click();
        // The data-theme attribute should change on the root <html> element
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
    test('switches back to light theme', async ({ page }) => {
        await page.goto('/settings');
        // Switch to dark first
        await page.getByTestId('theme-dark').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        // Switch back to light
        await page.getByTestId('theme-light').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
    test('shows saved confirmation after theme change', async ({ page }) => {
        await page.goto('/settings');
        // Saved message should not be visible initially
        await expect(page.getByTestId('saved-message')).toBeHidden();
        // Click a theme card
        await page.getByTestId('theme-dark').click();
        // Saved message should appear
        await expect(page.getByTestId('saved-message')).toBeVisible();
        await expect(page.getByTestId('saved-message')).toContainText('Settings saved');
    });
    test('default priority select works', async ({ page }) => {
        await page.goto('/settings');
        const select = page.getByTestId('default-priority-select');
        await expect(select).toBeVisible();
        // Change priority to "high"
        await select.selectOption('high');
        await expect(select).toHaveValue('high');
        // Saved message should appear
        await expect(page.getByTestId('saved-message')).toBeVisible();
    });
});
//# sourceMappingURL=settings.spec.js.map