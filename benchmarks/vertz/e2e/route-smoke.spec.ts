import { test, expect } from '@playwright/test';

const FORBIDDEN_PATTERNS = [
  '[object Object]',
  '__element',
  '__append',
  '__staticText',
  '__enterChildren',
  '__exitChildren',
  '__child',
  'jsxDEV',
  '() =>',
  'function () {',
];

const staticRoutes = [
  '/',
  '/about',
  '/products',
  '/blog',
  '/dashboard',
  '/dashboard/analytics',
  '/dashboard/users',
  '/dashboard/settings',
  '/docs',
  '/settings',
  '/settings/profile',
  '/settings/notifications',
  '/settings/billing',
  '/features',
  '/pricing',
  '/team',
  '/careers',
  '/contact',
  '/faq',
  '/terms',
  '/privacy',
  '/changelog',
  '/roadmap',
  '/support',
  '/community',
  '/partners',
  '/press',
  '/security',
];

const dynamicRoutes = [
  '/products/1',
  '/blog/post-1',
  '/docs/getting-started',
];

const allRoutes = [...staticRoutes, ...dynamicRoutes];

for (const route of allRoutes) {
  test(`${route} renders without errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('[Fast Refresh]')) {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto(route, { waitUntil: 'load' });

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Body should have meaningful content
    expect(bodyText.trim().length).toBeGreaterThan(10);

    // No forbidden patterns in visible text
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(bodyText).not.toContain(pattern);
    }

    // No console errors
    expect(consoleErrors).toEqual([]);
  });
}
