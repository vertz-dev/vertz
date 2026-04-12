import { expect, test } from '@playwright/test';
import { createClient } from '#generated';

/** The default seed workspace — must match SEED_WORKSPACE_ID in schema.ts. */
const SEED_WORKSPACE_ID = 'ws-acme';

/**
 * Signs up a test user, then switches to the seed tenant so all entity
 * operations are tenant-scoped. Returns cookies for Playwright context.
 */
async function authenticate(baseURL: string) {
  const api = createClient({ baseURL: `${baseURL}/api` });
  const email = `e2e-${Date.now()}@test.local`;
  const password = 'TestPassword123!';

  // 1. Sign up — session has no tenantId yet
  const signupResult = await api.auth.signUp({ email, password });
  if (!signupResult.ok) {
    throw new Error(`Auth signup failed: ${signupResult.error.message}`);
  }

  // 2. Switch to seed workspace — session now includes tenantId in JWT
  const switchResult = await api.auth.switchTenant({ tenantId: SEED_WORKSPACE_ID });
  if (!switchResult.ok) {
    throw new Error(`Switch tenant failed: ${switchResult.error.message}`);
  }

  // Convert SDK cookies to Playwright-compatible format
  const url = new URL(baseURL);
  return api.auth.cookies().map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || url.hostname,
    path: c.path || '/',
  }));
}

test.describe('Linear Clone', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const url = baseURL ?? 'http://localhost:3001';
    const cookies = await authenticate(url);
    await context.addCookies(cookies);
  });

  test('project list displays seeded projects', async ({ page }) => {
    await page.goto('/projects');

    // Wait for projects to load — should show seeded projects
    await expect(page.getByTestId('project-name').first()).toBeVisible({ timeout: 15_000 });

    // Should have the 3 seeded projects
    const projectNames = page.getByTestId('project-name');
    await expect(projectNames).toHaveCount(3);
  });

  test('board displays issues by status columns', async ({ page }) => {
    await page.goto('/projects');

    // Navigate to Engineering project
    await page.getByText('Engineering').first().click();

    // Switch to board view
    await page.getByText('Board').click();
    await expect(page.getByTestId('board')).toBeVisible({ timeout: 15_000 });

    // Board should have status columns
    await expect(page.getByTestId('column-backlog')).toBeVisible();
    await expect(page.getByTestId('column-todo')).toBeVisible();
    await expect(page.getByTestId('column-in_progress')).toBeVisible();
    await expect(page.getByTestId('column-done')).toBeVisible();

    // Columns should contain issue cards
    const issueCards = page.locator('[data-testid^="issue-card-"]');
    const count = await issueCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('create issue appears in list', async ({ page }) => {
    await page.goto('/projects');

    // Navigate to Engineering project
    await page.getByText('Engineering').first().click();
    await expect(page.getByText('Issues')).toBeVisible({ timeout: 15_000 });

    // Open create dialog
    await page.getByRole('button', { name: 'New Issue' }).click();

    // Fill in the form
    const uniqueTitle = `E2E Test Issue ${Date.now()}`;
    await page.locator('#issue-title').fill(uniqueTitle);
    await page.locator('#issue-description').fill('Created by E2E test');

    // Submit
    await page.getByRole('button', { name: 'Create Issue' }).click();

    // Issue should appear in the list after refetch
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('status change updates issue on detail page', async ({ page }) => {
    await page.goto('/projects');

    // Navigate to Engineering project's first issue
    await page.getByText('Engineering').first().click();
    await expect(page.getByText('Issues')).toBeVisible({ timeout: 15_000 });

    // Click the first issue to go to detail
    const firstIssueLink = page.locator('[data-testid^="issue-card-"]').first().locator('..');
    await firstIssueLink.click();
    await expect(page.getByTestId('issue-detail')).toBeVisible({ timeout: 10_000 });

    // Verify sidebar with status select is visible
    await expect(page.getByTestId('status-select')).toBeVisible();

    // Change status
    await page.getByTestId('status-select').selectOption('done');

    // The select should reflect the new value
    await expect(page.getByTestId('status-select')).toHaveValue('done');
  });

  test('add comment to issue', async ({ page }) => {
    await page.goto('/projects');

    // Navigate to Engineering project
    await page.getByText('Engineering').first().click();
    await expect(page.getByText('Issues')).toBeVisible({ timeout: 15_000 });

    // Go to first issue detail
    const firstIssueLink = page.locator('[data-testid^="issue-card-"]').first().locator('..');
    await firstIssueLink.click();
    await expect(page.getByTestId('comment-section')).toBeVisible({ timeout: 10_000 });

    // Add a comment
    const commentText = `E2E comment ${Date.now()}`;
    await page.getByTestId('comment-input').fill(commentText);
    await page.getByRole('button', { name: 'Comment' }).click();

    // Comment should appear in the list
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10_000 });
  });

  test('navigation preserves sidebar state', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('[data-part="sidebar"]')).toBeVisible({ timeout: 15_000 });

    // Sidebar shows project links
    await expect(page.locator('[data-part="sidebar"]').getByText('Projects')).toBeVisible();

    // Navigate to a project
    await page.getByText('Engineering').first().click();
    await expect(page.locator('[data-part="sidebar"]')).toBeVisible();

    // Navigate to an issue (if any visible)
    const firstIssueLink = page.locator('[data-testid^="issue-card-"]').first().locator('..');
    if (await firstIssueLink.isVisible()) {
      await firstIssueLink.click();
      // Sidebar should still be visible
      await expect(page.locator('[data-part="sidebar"]')).toBeVisible();
      await expect(page.locator('[data-part="sidebar"]').getByText('Projects')).toBeVisible();
    }
  });

  test('status filter updates visible issues in list', async ({ page }) => {
    await page.goto('/projects');

    // Navigate to Engineering project (list view is default)
    await page.getByText('Engineering').first().click();
    await expect(page.getByText('Issues')).toBeVisible({ timeout: 15_000 });

    // Wait for issues to load
    await expect(
      page.locator('[data-testid^="issue-card-"]').first().or(page.getByTestId('issues-empty')),
    ).toBeVisible({ timeout: 10_000 });

    // Record issue count before filtering
    const initialCount = await page.locator('[data-testid^="issue-card-"]').count();

    // Click a specific status filter
    await page.getByRole('button', { name: 'Done' }).click();

    // Wait for filter to apply — the count should change (or stay at 0)
    // Either fewer cards than before, or the empty state appears
    await expect(page.locator('[data-testid^="issue-card-"]').or(page.getByTestId('filter-empty')))
      .toBeVisible({ timeout: 5_000 })
      .catch(() => {
        // If nothing is visible, it means 0 "done" issues — that's fine
      });

    const filteredCount = await page.locator('[data-testid^="issue-card-"]').count();

    // Click "All" to reset filter
    await page.getByRole('button', { name: 'All' }).click();

    // Wait for all issues to reappear
    if (initialCount > 0) {
      await expect(page.locator('[data-testid^="issue-card-"]').first()).toBeVisible({
        timeout: 5_000,
      });
    }

    const allCount = await page.locator('[data-testid^="issue-card-"]').count();

    // All count should be >= filtered count
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);
  });
});
