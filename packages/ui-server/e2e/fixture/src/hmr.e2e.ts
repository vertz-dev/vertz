import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

declare const window: Window & {
  __HMR_TEST_MARKER?: boolean;
  __consoleErrors?: string[];
};

const APP_PATH = join(import.meta.dirname!, 'app.tsx');

// Helper: wait until the webview text matches expected value
async function waitForText(selector: string, expected: string, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const text = await page.textContent(selector);
    if (text?.trim() === expected) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  const actual = await page.textContent(selector);
  throw new Error(`timeout: expected "${selector}" to have text "${expected}", got "${actual}"`);
}

// Helper: wait until text includes substring
async function waitForTextIncludes(selector: string, substring: string, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const text = await page.textContent(selector);
    if (text?.includes(substring)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  const actual = await page.textContent(selector);
  throw new Error(
    `timeout: expected "${selector}" text to include "${substring}", got "${actual}"`,
  );
}

describe('Feature: HMR E2E smoke test', () => {
  it('page loads and heading is visible', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');
    const text = await page.textContent('[data-testid="heading"]');
    expect(text?.trim()).toBe('Hello HMR');
  });
});

describe('Feature: HMR text updates', () => {
  let originalContent: string;

  beforeAll(() => {
    originalContent = readFileSync(APP_PATH, 'utf-8');
  });

  afterEach(async () => {
    writeFileSync(APP_PATH, originalContent);
    // Wait for dev server to process restored file
    await new Promise((r) => setTimeout(r, 2000));
  });

  it('text updates without full page reload', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Set a marker to detect full page reloads — HMR should NOT clear this
    await page.evaluate(() => {
      window.__HMR_TEST_MARKER = true;
    });

    // Edit source file
    const edited = originalContent.replace('Hello HMR', 'Hello Updated');
    writeFileSync(APP_PATH, edited);

    // Wait for HMR to apply
    await waitForText('[data-testid="heading"]', 'Hello Updated');

    // Verify no full page reload occurred (marker survives HMR, cleared by reload)
    const marker = await page.evaluate(() => {
      return window.__HMR_TEST_MARKER;
    });
    expect(marker).toBe(true);
  });

  it('no console errors emitted during HMR', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Capture console errors by injecting a listener
    await page.evaluate(() => {
      window.__consoleErrors = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        window.__consoleErrors!.push(args.map(String).join(' '));
        origError.apply(console, args);
      };
    });

    const edited = originalContent.replace('Hello HMR', 'Hello NoErrors');
    writeFileSync(APP_PATH, edited);

    await waitForText('[data-testid="heading"]', 'Hello NoErrors');

    const errors = await page.evaluate(() => {
      return window.__consoleErrors;
    });
    expect(errors).toEqual([]);
  });
});

describe('Feature: HMR state preservation', () => {
  let originalContent: string;

  beforeAll(() => {
    originalContent = readFileSync(APP_PATH, 'utf-8');
  });

  afterEach(async () => {
    writeFileSync(APP_PATH, originalContent);
    await new Promise((r) => setTimeout(r, 2000));
  });

  it('counter and derived value preserved after text edit', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Increment counter to 5
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="increment-btn"]');
    }

    // Wait for counter to update
    await waitForText('[data-testid="counter-display"]', 'Count: 5');
    await waitForText('[data-testid="derived-display"]', 'Doubled: 10');

    // Edit heading text (non-state change)
    const edited = originalContent.replace('Hello HMR', 'Hello State Test');
    writeFileSync(APP_PATH, edited);

    // Wait for HMR to apply the text change
    await waitForText('[data-testid="heading"]', 'Hello State Test');

    // Verify counter state preserved across HMR
    const counterText = await page.textContent('[data-testid="counter-display"]');
    expect(counterText?.trim()).toBe('Count: 5');
    const derivedText = await page.textContent('[data-testid="derived-display"]');
    expect(derivedText?.trim()).toBe('Doubled: 10');
  });
});

describe('Feature: HMR DOM state preservation', () => {
  let originalContent: string;

  beforeAll(() => {
    originalContent = readFileSync(APP_PATH, 'utf-8');
  });

  afterEach(async () => {
    writeFileSync(APP_PATH, originalContent);
    await new Promise((r) => setTimeout(r, 2000));
  });

  it('input value preserved after HMR', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Type into the input field
    await page.fill('[data-testid="text-input"]', 'hello world');

    // Edit heading text
    const edited = originalContent.replace('Hello HMR', 'Hello Input Test');
    writeFileSync(APP_PATH, edited);

    await waitForText('[data-testid="heading"]', 'Hello Input Test');

    // Verify input value preserved
    const value = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="text-input"]') as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('hello world');
  });

  it('focus state preserved after HMR', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Focus the input field
    await page.click('[data-testid="text-input"]');

    // Verify focus is on the input
    const focusedBefore = await page.evaluate(() => {
      return document.activeElement === document.querySelector('[data-testid="text-input"]');
    });
    expect(focusedBefore).toBe(true);

    // Edit heading text
    const edited = originalContent.replace('Hello HMR', 'Hello Focus Test');
    writeFileSync(APP_PATH, edited);

    await waitForText('[data-testid="heading"]', 'Hello Focus Test');

    // Verify focus preserved
    const focusedAfter = await page.evaluate(() => {
      return document.activeElement === document.querySelector('[data-testid="text-input"]');
    });
    expect(focusedAfter).toBe(true);
  });

  it('scroll position preserved after HMR', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Scroll the container
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="scroll-container"]');
      if (el) el.scrollTop = 200;
    });

    // Verify scroll is set
    const scrollBefore = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="scroll-container"]');
      return el ? el.scrollTop : 0;
    });
    expect(scrollBefore).toBe(200);

    // Edit heading text
    const edited = originalContent.replace('Hello HMR', 'Hello Scroll Test');
    writeFileSync(APP_PATH, edited);

    await waitForText('[data-testid="heading"]', 'Hello Scroll Test');

    // Verify scroll position preserved (poll for resilience)
    let scrollAfter = 0;
    const start = Date.now();
    while (Date.now() - start < 3000) {
      scrollAfter = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="scroll-container"]');
        return el ? el.scrollTop : 0;
      });
      if (scrollAfter === 200) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(scrollAfter).toBe(200);
  });
});

describe('Feature: Hydration correctness', () => {
  it('click handler fires after hydration', async () => {
    await waitForText('[data-testid="heading"]', 'Hello HMR');

    // Wait for hydration by polling — click until the counter responds
    const start = Date.now();
    let counterText = 'Count: 0';
    while (Date.now() - start < 10_000) {
      await page.click('[data-testid="increment-btn"]');
      counterText =
        (await page.textContent('[data-testid="counter-display"]'))?.trim() ?? 'Count: 0';
      if (counterText !== 'Count: 0') break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Counter should have incremented (hydration worked)
    expect(counterText).not.toBe('Count: 0');
  });
});
