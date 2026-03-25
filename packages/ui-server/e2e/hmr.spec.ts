import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const APP_PATH = join(__dirname, 'fixture/src/app.tsx');

type WindowWithMarker = Window & { __HMR_TEST_MARKER?: boolean };

test.describe('Feature: HMR E2E smoke test', () => {
  test('page loads and heading is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR', {
      timeout: 10_000,
    });
  });
});

test.describe('Feature: HMR text updates', () => {
  let originalContent: string;

  test.beforeAll(() => {
    originalContent = readFileSync(APP_PATH, 'utf-8');
  });

  test.afterEach(() => {
    writeFileSync(APP_PATH, originalContent);
  });

  test.afterAll(async () => {
    writeFileSync(APP_PATH, originalContent);
    // Wait for dev server to process restored file.
    // Watcher debounce (100ms) + SSR re-import with retry (up to 2x500ms) = ~1100ms worst case.
    // 3000ms adds safety margin. Matches pattern from runtime-error-overlay.spec.ts.
    await new Promise((r) => setTimeout(r, 3000));
  });

  test('text updates without full page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    // Set a marker to detect full page reloads — HMR should NOT clear this
    await page.evaluate(() => {
      Object.assign(window, { __HMR_TEST_MARKER: true });
    });

    // Edit source file
    const edited = originalContent.replace('Hello HMR', 'Hello Updated');
    writeFileSync(APP_PATH, edited);

    // Wait for HMR to apply
    await expect(page.getByTestId('heading')).toHaveText('Hello Updated', {
      timeout: 10_000,
    });

    // Verify no full page reload occurred (marker survives HMR, cleared by reload)
    const marker = await page.evaluate(() => (window as WindowWithMarker).__HMR_TEST_MARKER);
    expect(marker).toBe(true);
  });

  test('no console errors emitted during HMR', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    const edited = originalContent.replace('Hello HMR', 'Hello NoErrors');
    writeFileSync(APP_PATH, edited);

    await expect(page.getByTestId('heading')).toHaveText('Hello NoErrors', {
      timeout: 10_000,
    });

    expect(errors).toEqual([]);
  });
});

test.describe('Feature: HMR state preservation', () => {
  let originalContent: string;

  test.beforeAll(() => {
    originalContent = readFileSync(APP_PATH, 'utf-8');
  });

  test.afterEach(() => {
    writeFileSync(APP_PATH, originalContent);
  });

  test.afterAll(async () => {
    writeFileSync(APP_PATH, originalContent);
    await new Promise((r) => setTimeout(r, 3000));
  });

  test('counter and derived value preserved after text edit', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    // Increment counter to 5
    const btn = page.getByTestId('increment-btn');
    for (let i = 0; i < 5; i++) {
      await btn.click();
    }
    await expect(page.getByTestId('counter-display')).toHaveText('Count: 5');
    await expect(page.getByTestId('derived-display')).toHaveText('Doubled: 10');

    // Edit heading text (non-state change)
    const edited = originalContent.replace('Hello HMR', 'Hello State Test');
    writeFileSync(APP_PATH, edited);

    // Wait for HMR to apply the text change
    await expect(page.getByTestId('heading')).toHaveText('Hello State Test', {
      timeout: 10_000,
    });

    // Verify counter state preserved across HMR
    await expect(page.getByTestId('counter-display')).toHaveText('Count: 5');
    await expect(page.getByTestId('derived-display')).toHaveText('Doubled: 10');
  });
});

test.describe('Feature: HMR DOM state preservation', () => {
  let originalContent: string;

  test.beforeAll(() => {
    originalContent = readFileSync(APP_PATH, 'utf-8');
  });

  test.afterEach(() => {
    writeFileSync(APP_PATH, originalContent);
  });

  test.afterAll(async () => {
    writeFileSync(APP_PATH, originalContent);
    await new Promise((r) => setTimeout(r, 3000));
  });

  test('input value preserved after HMR', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    // Type into the input field
    const input = page.getByTestId('text-input');
    await input.fill('hello world');

    // Edit heading text
    const edited = originalContent.replace('Hello HMR', 'Hello Input Test');
    writeFileSync(APP_PATH, edited);

    await expect(page.getByTestId('heading')).toHaveText('Hello Input Test', {
      timeout: 10_000,
    });

    // Verify input value preserved
    await expect(input).toHaveValue('hello world');
  });

  test('focus state preserved after HMR', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    // Focus the input field
    const input = page.getByTestId('text-input');
    await input.focus();

    // Verify focus is on the input
    await expect(input).toBeFocused();

    // Edit heading text
    const edited = originalContent.replace('Hello HMR', 'Hello Focus Test');
    writeFileSync(APP_PATH, edited);

    await expect(page.getByTestId('heading')).toHaveText('Hello Focus Test', {
      timeout: 10_000,
    });

    // Verify focus preserved
    await expect(input).toBeFocused();
  });

  test('scroll position preserved after HMR', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    // Scroll the container
    const scrollContainer = page.getByTestId('scroll-container');
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 200;
    });
    const scrollBefore = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrollBefore).toBe(200);

    // Edit heading text
    const edited = originalContent.replace('Hello HMR', 'Hello Scroll Test');
    writeFileSync(APP_PATH, edited);

    await expect(page.getByTestId('heading')).toHaveText('Hello Scroll Test', {
      timeout: 10_000,
    });

    // Verify scroll position preserved
    const scrollAfter = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrollAfter).toBe(200);
  });
});

test.describe('Feature: Hydration correctness', () => {
  test('click handler fires exactly once after hydration', async ({ page }) => {
    // Navigate to page — SSR renders HTML, client hydrates
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR', {
      timeout: 10_000,
    });

    // Wait for client hydration to complete
    await page.waitForTimeout(1000);

    // Click the increment button exactly once
    await page.getByTestId('increment-btn').click();

    // Verify the counter incremented by exactly 1 (not 10x due to duplicate handlers)
    await expect(page.getByTestId('counter-display')).toHaveText('Count: 1');
  });
});
