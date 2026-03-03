#!/usr/bin/env node
/**
 * @deprecated Use the Playwright E2E suite instead: cd benchmarks/vertz && bunx playwright test
 * This script is kept for backwards compatibility but the new suite at
 * benchmarks/vertz/e2e/ covers all routes plus interactivity, hydration, and SSR tests.
 *
 * Quick Playwright smoke test for the Vertz benchmark app.
 * Checks each route renders real content (not function source or [object Object]).
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Playwright is installed globally via volta — resolve from its global location
const playwrightPath = '/Users/viniciusdacal/.volta/tools/image/packages/playwright/lib/node_modules/playwright';
const { chromium } = require(playwrightPath);

const BASE = process.env.SMOKE_TEST_URL || 'http://localhost:4201';

const routes = [
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
];

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push({ url: page.url(), text: err.message });
  });

  let passed = 0;
  let failed = 0;

  for (const route of routes) {
    const url = `${BASE}${route}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });

      // Wait for client hydration
      await page.waitForTimeout(500);

      const bodyText = await page.evaluate(() => document.body.innerText);
      const bodyHtml = await page.evaluate(() => document.body.innerHTML);

      const routeErrors = [];

      // Check for forbidden patterns in visible text
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (bodyText.includes(pattern)) {
          routeErrors.push(`Visible text contains "${pattern}"`);
        }
      }

      // Check body is not empty
      if (bodyText.trim().length < 10) {
        routeErrors.push(`Body text is too short (${bodyText.trim().length} chars)`);
      }

      // Check for JS errors caught during page load
      const pageConsoleErrors = consoleErrors.filter((e) => e.url === url);
      for (const err of pageConsoleErrors) {
        if (!err.text.includes('[Fast Refresh]')) {
          routeErrors.push(`Console error: ${err.text.slice(0, 200)}`);
        }
      }

      if (routeErrors.length > 0) {
        failed++;
        console.log(`  FAIL  ${route}`);
        for (const err of routeErrors) {
          console.log(`        ${err}`);
          errors.push({ route, error: err });
        }
      } else {
        passed++;
        console.log(`  PASS  ${route} (${bodyText.trim().slice(0, 60).replace(/\n/g, ' ')}...)`);
      }
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${route}`);
      console.log(`        ${err.message}`);
      errors.push({ route, error: err.message });
    }
  }

  // Check uncaught console errors across all pages
  const uncaught = consoleErrors.filter(
    (e) => !e.text.includes('[Fast Refresh]')
  );

  console.log('\n--- Summary ---');
  console.log(`  ${passed} passed, ${failed} failed out of ${routes.length} routes`);

  if (uncaught.length > 0) {
    console.log(`\n--- Console Errors (${uncaught.length}) ---`);
    for (const err of uncaught) {
      console.log(`  ${err.url}: ${err.text.slice(0, 200)}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n--- Route Failures (${errors.length}) ---`);
    for (const { route, error } of errors) {
      console.log(`  ${route}: ${error}`);
    }
  }

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
