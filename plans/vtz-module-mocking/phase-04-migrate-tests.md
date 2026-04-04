# Phase 4: Migrate Existing Tests

## Context

Phases 1-3 implement and validate the module mocking feature. This phase refactors existing test files that use non-top-level `mock.module()` / `vi.mock()` patterns, then verifies all 15 module-mocking test files pass under `vtz test`.

Design doc: `plans/vtz-module-mocking.md`

## Tasks

### Task 1: Refactor `mock.module()` inside `it()` blocks — database tests

**Files:**
- `packages/db/src/client/__tests__/database.test.ts` (modify)
- `packages/db/src/client/__tests__/postgres-driver.test.ts` (modify)

**What to implement:**

These files use `mock.module()` inside `it()` blocks combined with `await import(...)` to get fresh module instances per test. This pattern does not work with compile-time mock hoisting.

**Migration pattern:**

Before (bun:test runtime mocking):
```ts
it('test with config A', async () => {
  mock.module('postgres', () => ({ default: mock(() => driverA) }));
  const { PostgresDriver } = await import('../postgres-driver');
  // ...
});
```

After (vtz compile-time mocking):
```ts
const mockPostgresFactory = vi.fn();
vi.mock('postgres', () => ({ default: mockPostgresFactory }));

import { PostgresDriver } from '../postgres-driver';

it('test with config A', () => {
  mockPostgresFactory.mockReturnValue(driverA);
  // ... use PostgresDriver directly
});
```

For `database.test.ts`: 5 `mock.module()` calls inside `it()` blocks need hoisting.
For `postgres-driver.test.ts`: 3 `mock.module()` calls inside `it()` blocks need hoisting.

**Acceptance criteria:**
- [x] No `mock.module()` or `vi.mock()` calls remain inside `it()` or `describe()` blocks
- [x] All mocks are at module top level
- [x] Per-test behavior changes use `mockFn.mockReturnValue()` / `mockFn.mockImplementation()`
- [x] All existing test assertions still pass
- [x] No test logic changes — only mock placement refactoring

---

### Task 2: Refactor `mock.module()` inside `beforeEach()` — Cloudflare tests

**Files:**
- `packages/cloudflare/tests/handler.test.ts` (modify)
- `packages/cloudflare/tests/handler-isr.test.ts` (modify)

**What to implement:**

These files use `mock.module()` inside `beforeEach()` to re-register mocks before each test. Move the mock to module top level and keep `mockClear()` / `mockReset()` in `beforeEach()`.

Before:
```ts
beforeEach(() => {
  mock.module('@vertz/ui-server/ssr', () => ({
    createSSRHandler: mockCreateSSRHandler,
  }));
  mockCreateSSRHandler.mockClear();
});
```

After:
```ts
vi.mock('@vertz/ui-server/ssr', () => ({
  createSSRHandler: mockCreateSSRHandler,
}));

beforeEach(() => {
  mockCreateSSRHandler.mockClear();
});
```

**Acceptance criteria:**
- [x] No `mock.module()` calls remain inside `beforeEach()`
- [x] All mocks are at module top level
- [x] `mockClear()` / `mockReset()` calls remain in `beforeEach()` for per-test cleanup
- [x] All existing test assertions still pass

---

### Task 3: Verify all 15 module-mocking files pass

**Files:**
- No file changes — verification only

**What to implement:**

Run `vtz test` on each of the 15 files that use module mocking and verify they pass. The files are:

1. `packages/cli/src/pipeline/__tests__/orchestrator.test.ts`
2. `packages/cli/src/production-build/__tests__/orchestrator.test.ts`
3. `packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts`
4. `packages/cli/src/__tests__/db.test.ts`
5. `packages/cli/src/__tests__/db-pull.test.ts`
6. `packages/cli/src/commands/__tests__/start.test.ts`
7. `packages/cli/src/commands/__tests__/docs.test.ts`
8. `packages/db/src/client/__tests__/database.test.ts` (refactored in Task 1)
9. `packages/db/src/client/__tests__/postgres-driver.test.ts` (refactored in Task 1)
10. `packages/ui-primitives/src/utils/__tests__/floating.test.ts`
11. `packages/cloudflare/tests/handler.test.ts` (refactored in Task 2)
12. `packages/cloudflare/tests/handler-isr.test.ts` (refactored in Task 2)
13. `packages/create-vertz-app/src/__tests__/create-vertz-app.test.ts`
14. `packages/cli/src/__tests__/load-introspect-context.test.ts`
15. `packages/cli/src/commands/__tests__/build.test.ts`

For each file: run `vtz test <file>` and verify all tests pass.

Then run the full test suite (`vtz test`) and compare pass/fail counts before and after to ensure no regressions.

**Acceptance criteria:**
- [x] All 15 files pass under `vtz test`
- [x] Full `vtz test` run shows no regressions in non-mocking test files
- [x] No `mock.module()` or `vi.mock()` calls remain inside function bodies across the entire codebase

---

### Task 4: Update `build.test.ts` to use `vi.mock()` (optional improvement)

**Files:**
- `packages/cli/src/commands/__tests__/build.test.ts` (modify)

**What to implement:**

This file explicitly avoids `vi.mock()` due to bun:test's global mock leaking problem (documented in a comment). With `vtz test`'s per-file isolation, this workaround is no longer needed.

Review the file and determine if using `vi.mock()` would simplify the test setup (replacing manual `spyOn()` patterns). If so, refactor. If the current approach is cleaner, leave it and update the comment to note that the limitation no longer applies with `vtz test`.

**Acceptance criteria:**
- [x] The outdated comment about bun:test global leaking is updated or removed
- [x] If refactored: uses `vi.mock()` instead of manual `spyOn()` workaround
- [x] If kept as-is: comment updated to explain the choice (not the bun:test limitation)
- [x] Tests still pass
