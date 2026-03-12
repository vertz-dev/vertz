/**
 * Diagnostic E2E test: captures every WS message and overlay state
 * to understand the exact sequence during a runtime error.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const TASK_CARD_PATH = join(import.meta.dirname, '../src/components/task-card.tsx');

test.describe('Runtime Error Overlay Diagnostic', () => {
  let originalContent: string;

  test.beforeAll(() => {
    originalContent = readFileSync(TASK_CARD_PATH, 'utf-8');
  });

  test.afterAll(async () => {
    writeFileSync(TASK_CARD_PATH, originalContent);
    // Allow dev server to process the restored file before other test files run
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  test.afterEach(() => {
    writeFileSync(TASK_CARD_PATH, originalContent);
  });

  test('captures full overlay state on HMR runtime error', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // 1. Load the page normally
    await page.goto('/');
    await expect(page.getByTestId('task-list')).toBeVisible({ timeout: 10_000 });

    // 2. Introduce a runtime error
    const brokenContent = originalContent.replace(
      'export function TaskCard({ task, onClick }: TaskCardProps) {',
      `export function TaskCard({ task, onClick }: TaskCardProps) {
  // @ts-expect-error — intentional runtime error for e2e test
  const _broken = NonExistentComponent.render();`,
    );
    writeFileSync(TASK_CARD_PATH, brokenContent);

    // 3. Wait for overlay to appear
    const overlay = page.locator('#__vertz_error');
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // 4. Wait for all messages to settle (debounce, WS round-trips)
    await page.waitForTimeout(3000);

    // 5. Capture final state
    const overlayHtml = await overlay.innerHTML();
    const overlayText = await overlay.textContent();

    const dataEl = page.locator('#__vertz_error_data');
    let payload: unknown = null;
    if ((await dataEl.count()) > 0) {
      const jsonText = await dataEl.textContent();
      if (jsonText) payload = JSON.parse(jsonText);
    }

    // 6. Print diagnostic
    console.log('\n========== DIAGNOSTIC ==========');
    console.log('\n--- Overlay Text ---');
    console.log(overlayText);
    console.log('\n--- Overlay HTML (last 2000 chars) ---');
    console.log(overlayHtml.slice(-2000));
    console.log('\n--- JSON Payload ---');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n--- Browser Console (last 30) ---');
    for (const log of consoleLogs.slice(-30)) {
      console.log(log);
    }
    console.log('\n========== END ==========');

    // Assert: the overlay should contain meaningful source info
    expect(overlayText).toContain('NonExistentComponent');

    // Assert: the overlay should show the source file path
    expect(overlayText).toContain('src/components/task-card.tsx');
  });
});
