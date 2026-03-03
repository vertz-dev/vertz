import { test, expect } from '@playwright/test';

test.describe('Search reactivity', () => {
  test('typing in search shows hint, clearing hides it', async ({ page }) => {
    await page.goto('/blog', { waitUntil: 'load' });

    const searchInput = page.locator('input[placeholder="Search posts..."]');
    await expect(searchInput).toBeVisible();

    // Initially no search hint
    await expect(page.getByText(/Searching for:/)).not.toBeVisible();

    // Type text — Vertz renders reactive value without space: "Searching for:react patterns"
    await searchInput.fill('react patterns');
    await expect(page.getByText(/Searching for:\s*react patterns/)).toBeVisible();

    // Clear input
    await searchInput.fill('');
    await expect(page.getByText(/Searching for:/)).not.toBeVisible();
  });

  test('search is also present on blog post pages', async ({ page }) => {
    await page.goto('/blog/post-1', { waitUntil: 'load' });

    const searchInput = page.locator('input[placeholder="Search posts..."]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('test');
    await expect(page.getByText(/Searching for:\s*test/)).toBeVisible();
  });
});
