import { test, expect } from '@playwright/test';

test.describe('Client-side navigation (top nav)', () => {
  test('top nav uses client-side navigation (no full reload)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Set a marker on window — survives client-side nav, lost on full reload
    await page.evaluate(() => {
      (window as any).__NAV_MARKER = true;
    });

    // Click a top nav link
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await nav.getByText('Products').click();
    await expect(page).toHaveURL('/products');

    // Marker should survive (client-side nav)
    const markerSurvived = await page.evaluate(() => (window as any).__NAV_MARKER === true);
    expect(markerSurvived).toBe(true);
  });

  test('top nav: Home -> Products -> Blog -> Dashboard -> About -> Settings', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Benchmark App' })).toBeVisible();

    const nav = page.locator('nav[aria-label="Main navigation"]');

    await nav.getByText('Products').click();
    await expect(page).toHaveURL('/products');
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

    await nav.getByText('Blog').click();
    await expect(page).toHaveURL('/blog');
    await expect(page.getByRole('heading', { name: 'Blog' }).first()).toBeVisible();

    await nav.getByText('Dashboard').click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();

    await nav.getByText('About').click();
    await expect(page).toHaveURL('/about');
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();

    await nav.getByText('Settings').click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible();
  });
});

test.describe('Dashboard sidebar navigation', () => {
  test('sidebar links navigate between dashboard pages', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });

    const sidebar = page.locator('aside');

    await sidebar.getByText('Analytics').click();
    await expect(page).toHaveURL('/dashboard/analytics');

    await sidebar.getByText('Users').click();
    await expect(page).toHaveURL('/dashboard/users');

    await sidebar.getByText('Settings').click();
    await expect(page).toHaveURL('/dashboard/settings');

    await sidebar.getByText('Overview').click();
    await expect(page).toHaveURL('/dashboard');
  });
});

test.describe('Settings sidebar navigation', () => {
  test('sidebar links navigate between settings pages', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'load' });

    const sidebar = page.locator('aside');

    await sidebar.getByText('Profile').click();
    await expect(page).toHaveURL('/settings/profile');

    await sidebar.getByText('Notifications').click();
    await expect(page).toHaveURL('/settings/notifications');

    await sidebar.getByText('Billing').click();
    await expect(page).toHaveURL('/settings/billing');

    await sidebar.getByText('General').click();
    await expect(page).toHaveURL('/settings');
  });
});
