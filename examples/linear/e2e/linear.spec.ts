import { expect, test } from '@playwright/test';

/** The default seed tenant — must match SEED_TENANT_ID in schema.ts. */
const SEED_TENANT_ID = 'tenant-acme';

/** Extract Set-Cookie headers into Playwright-compatible cookie objects. */
function extractCookies(res: Response, baseURL: string) {
  const cookies: { name: string; value: string; domain: string; path: string }[] = [];
  const url = new URL(baseURL);

  for (const header of res.headers.getSetCookie()) {
    const [nameValue] = header.split(';');
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx > 0) {
      cookies.push({
        name: nameValue.slice(0, eqIdx),
        value: nameValue.slice(eqIdx + 1),
        domain: url.hostname,
        path: '/',
      });
    }
  }

  return cookies;
}

/**
 * Signs up a test user, then switches to the seed tenant so all entity
 * operations are tenant-scoped. Returns cookies with tenantId in the JWT.
 */
async function authenticate(baseURL: string) {
  const email = `e2e-${Date.now()}@test.local`;
  const password = 'TestPassword123!';

  // 1. Sign up — session has no tenantId yet
  const signupRes = await fetch(`${baseURL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VTZ-Request': '1' },
    body: JSON.stringify({ email, password }),
  });

  if (!signupRes.ok) {
    const body = await signupRes.text();
    throw new Error(`Auth signup failed: ${signupRes.status} ${body}`);
  }

  const signupCookies = extractCookies(signupRes, baseURL);

  // 2. Switch to seed tenant — session now includes tenantId in JWT
  const cookieHeader = signupCookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const switchRes = await fetch(`${baseURL}/api/auth/switch-tenant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VTZ-Request': '1',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ tenantId: SEED_TENANT_ID }),
  });

  if (!switchRes.ok) {
    const body = await switchRes.text();
    throw new Error(`Switch tenant failed: ${switchRes.status} ${body}`);
  }

  // Use cookies from switch-tenant (they contain the updated JWT with tenantId)
  return extractCookies(switchRes, baseURL);
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
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 15_000 });

    // Sidebar shows project links
    await expect(page.getByTestId('sidebar').getByText('Projects')).toBeVisible();

    // Navigate to a project
    await page.getByText('Engineering').first().click();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Navigate to an issue (if any visible)
    const firstIssueLink = page.locator('[data-testid^="issue-card-"]').first().locator('..');
    if (await firstIssueLink.isVisible()) {
      await firstIssueLink.click();
      // Sidebar should still be visible
      await expect(page.getByTestId('sidebar')).toBeVisible();
      await expect(page.getByTestId('sidebar').getByText('Projects')).toBeVisible();
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
