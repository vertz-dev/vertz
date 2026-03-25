# HMR E2E Playwright Tests

**Issue:** #1851
**Type:** Test infrastructure — no new framework APIs

---

## API Surface

No public API changes. This adds E2E Playwright tests that exercise the existing HMR pipeline end-to-end: dev server startup → SSR + hydration → component interaction → source file edit → HMR hot update → verify DOM/state preservation.

### Test Fixture App

A minimal Vertz app lives at `packages/ui-server/e2e/fixture/`:

```tsx
// e2e/fixture/src/app.tsx
export function App() {
  let count = 0;               // reactive via compiler
  const doubled = count * 2;   // derived via compiler

  return (
    <div>
      <h1 data-testid="heading">Hello HMR</h1>
      <p data-testid="counter-display">Count: {count}</p>
      <p data-testid="derived-display">Doubled: {doubled}</p>
      <button data-testid="increment-btn" onClick={() => { count++; }}>
        Increment
      </button>
      <input data-testid="text-input" name="text-input" placeholder="Type here" />
      <div
        data-testid="scroll-container"
        style={{ height: '100px', overflow: 'auto' }}
      >
        <div style={{ height: '500px' }}>Scrollable content</div>
      </div>
    </div>
  );
}
```

```ts
// e2e/fixture/src/entry-client.ts
import { mount } from '@vertz/ui';
import { App } from './app';

import.meta.hot.accept();  // Required for HMR — without this, Bun triggers full page reloads

mount(App);
```

```ts
// e2e/fixture/dev-server.ts
// Internal test fixture — real apps use `@vertz/cli dev` or `@vertz/ui-server`
import { createBunDevServer } from '../../src/bun-dev-server';

const port = Number(process.env.PORT ?? 14321);
const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port,
  host: 'localhost',
  projectRoot: import.meta.dirname,
  ssrModule: true,
  title: 'HMR E2E Fixture',
  logRequests: false,
});

await devServer.start();
console.log(`[fixture] ready on http://localhost:${port}`);
```

### Playwright Configuration

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 14321;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // Tests share the dev server and modify fixture files serially
  retries: 1,
  workers: 1,            // Serial execution — file edits would race with parallel workers
  reporter: 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    headless: true,
  },

  webServer: {
    command: `PORT=${PORT} bun run e2e/fixture/dev-server.ts`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 20_000,  // First-time compilation may be slow
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

### Test Structure

```
packages/ui-server/
├── e2e/
│   ├── fixture/
│   │   ├── src/
│   │   │   ├── app.tsx
│   │   │   └── entry-client.ts
│   │   └── dev-server.ts
│   └── hmr.spec.ts
└── playwright.config.ts
```

### Test Scenarios (from issue BDD)

```typescript
// e2e/hmr.spec.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const APP_PATH = join(__dirname, 'fixture/src/app.tsx');

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
    // Watcher debounce (100ms) + SSR re-import with retry (up to 2×500ms) = ~1100ms worst case.
    // 3000ms adds safety margin. Matches pattern from runtime-error-overlay.spec.ts.
    await new Promise((r) => setTimeout(r, 3000));
  });

  test('text updates without full page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('heading')).toHaveText('Hello HMR');

    // Set a marker to detect full page reloads — HMR should NOT clear this
    await page.evaluate(() => {
      (window as any).__HMR_TEST_MARKER = true;
    });

    // Edit source file
    const edited = originalContent.replace('Hello HMR', 'Hello Updated');
    writeFileSync(APP_PATH, edited);

    // Wait for HMR to apply
    await expect(page.getByTestId('heading')).toHaveText('Hello Updated', {
      timeout: 10_000,
    });

    // Verify no full page reload occurred (marker survives HMR, cleared by reload)
    const marker = await page.evaluate(() => (window as any).__HMR_TEST_MARKER);
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

    // Filter out non-HMR errors (favicon 404s, CSP, etc.) if flaky
    expect(errors).toEqual([]);
  });
});

test.describe('Feature: HMR state preservation', () => {
  // Increment counter to N=5, edit heading text, verify counter stays at 5
  // Also verify derived value (doubled) stays at 10
});

test.describe('Feature: HMR DOM state preservation', () => {
  // Type "hello" in input, scroll container, trigger HMR text edit
  // Verify input value "hello" preserved, focus preserved, scroll position preserved
});

test.describe('Feature: Hydration correctness', () => {
  // Navigate to page (SSR + hydration), click increment button once
  // Verify counter-display shows "Count: 1" (not "Count: 10")
});
```

---

## Manifesto Alignment

- **Quality over speed** — These tests would have caught bugs #1849 (hydration 10x handlers) before manual testing found them.
- **Tests are the specification** — BDD scenarios define HMR correctness. If it's not tested, it doesn't exist.
- **Developer experience** — HMR is core DX; regressions here directly hurt framework users.

---

## Non-Goals

1. **Not testing CSS HMR** — Nice-to-have from the issue; out of scope for the must-have implementation.
2. **Not testing new-file HMR** — Adding a new component file and importing it is a separate concern (the auto-restart flow).
3. **Not testing Fast Refresh signal count warning** — Unit-level concern already tested in `fast-refresh-runtime.test.ts`.
4. **Not testing error overlay** — Already covered in `examples/task-manager/e2e/runtime-error-overlay.spec.ts`.
5. **Not running in CI** — Playwright tests that need a real dev server with file watchers are local-only, because file watcher behavior is non-deterministic across CI environments. May be revisited once CI runners are more predictable. A `test:e2e` script is provided for explicit local runs.

---

## Unknowns

1. **HMR timing reliability** — File write → Bun watcher → plugin compile → WS push → DOM update has multiple async hops. The `expect().toHaveText()` with 10s timeout should handle variance, but flaky timing is a risk.
   - **Resolution:** Use Playwright's built-in auto-retry assertions (`toHaveText`, `toBeVisible`) which poll until timeout. Add `page.waitForTimeout(500)` only as a last resort.

2. **Fixture app compilation** — The fixture uses workspace packages (`@vertz/ui`) which need to be built. Tests require `bun run build` to have run first.
   - **Resolution:** Document in the `test:e2e` script. Playwright `webServer` starts the dev server which loads the Bun plugin, handling compilation.

3. **afterAll file restoration timing** — The 3000ms sleep after restoring the original fixture file is a heuristic matching the existing `runtime-error-overlay.spec.ts` pattern. It accounts for watcher debounce (100ms) + SSR re-import retries (up to 2×500ms) + safety margin. If this proves flaky, a deterministic approach using `/__vertz_diagnostics` polling could replace it.

---

## POC Results

Not applicable — this uses established patterns from `examples/task-manager/e2e/` (Playwright + file edits + HMR wait).

---

## Type Flow Map

Not applicable — test-only task with no generic types in public API.

---

## E2E Acceptance Test

The tests ARE the acceptance criteria. From the issue:

```typescript
describe('Feature: HMR text updates', () => {
  describe('Given a running dev server with a component displaying text', () => {
    describe('When a source file is edited to change the text', () => {
      it('Then the text updates in the browser without a full page reload', () => {});
      it('Then no console errors are emitted', () => {});
    });
  });
});

describe('Feature: HMR state preservation', () => {
  describe('Given a component with reactive state (counter at N)', () => {
    describe('When a non-state source change is made (e.g. text edit)', () => {
      it('Then the counter value remains N after HMR update', () => {});
      it('Then derived value (doubled) remains consistent', () => {});
    });
  });
});

describe('Feature: HMR DOM state preservation', () => {
  describe('Given an input field with user-typed text', () => {
    describe('When HMR triggers a hot update', () => {
      it('Then the input value is preserved', () => {});
      it('Then focus state is preserved', () => {});
    });
  });

  describe('Given a scrolled container', () => {
    describe('When HMR triggers a hot update', () => {
      it('Then scroll position is preserved', () => {});
    });
  });
});

describe('Feature: Hydration correctness', () => {
  describe('Given a component with a click handler rendered via SSR', () => {
    describe('When the button is clicked once after hydration', () => {
      it('Then the handler fires exactly once (not 10x)', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Test Infrastructure + Fixture App

Set up the Playwright config, fixture app, and dev server entry.

**Acceptance criteria:**
- [ ] `@playwright/test` added to `devDependencies` in `packages/ui-server/package.json`
- [ ] Fixture app compiles and runs via `PORT=14321 bun run e2e/fixture/dev-server.ts`
- [ ] `playwright.config.ts` starts fixture dev server and browser
- [ ] A smoke test (`page.goto('/')` + heading visible) passes
- [ ] `test:e2e` script added to `package.json`

### Phase 2: HMR Text Updates

**Acceptance criteria:**
- [ ] Test: text updates in browser after file edit without full page reload (verified via `window.__HMR_TEST_MARKER`)
- [ ] Test: no console errors emitted during HMR cycle

### Phase 3: HMR State Preservation

**Acceptance criteria:**
- [ ] Test: counter value preserved after non-state text edit via HMR (increment to 5, edit heading, verify still 5)
- [ ] Test: derived value (doubled) remains consistent (verify shows 10 after HMR)

### Phase 4: HMR DOM State Preservation

**Acceptance criteria:**
- [ ] Test: input field value preserved after HMR
- [ ] Test: input focus state preserved after HMR
- [ ] Test: scroll position preserved after HMR

### Phase 5: Hydration Correctness

**Acceptance criteria:**
- [ ] Test: click increment button once after SSR hydration, verify counter shows "Count: 1" (not "Count: 10")
