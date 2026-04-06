# Test Runner & Runtime Documentation

**Issue:** #2377 (symptom: #2374)
**Type:** Documentation improvement
**Status:** Approved (Rev 2 — addressed review feedback)

## Problem

A user tried to run Vitest through `vtz run`/`vtz exec` (#2374), not understanding that `vtz` has a built-in test runner. This reveals documentation gaps:

1. No dedicated test runner page
2. Runtime page doesn't explain architecture (what uses V8 vs what spawns shell)
3. Testing section jumps to E2E/test-client without covering the foundation
4. `@vertz/test` import appears in examples without introduction

## API Surface

No new APIs — this documents existing functionality.

### `vtz test` CLI

```bash
vtz test [PATH...] [OPTIONS]

Options:
  --filter <str>              Filter tests by name
  --watch                     Re-run on file changes
  --coverage                  Collect V8 code coverage
  --coverage-threshold <n>    Minimum coverage integer % (default: 95)
  --timeout <ms>              Per-test timeout (default: 5000)
  --concurrency <n>           Max parallel test files
  --reporter <fmt>            terminal | json | junit
  --bail                      Stop after first failure
  --no-preload                Skip preload scripts from config
  --no-cache                  Skip compilation cache
  --root-dir <path>           Workspace root for module resolution
  --e2e                       Run E2E tests with webview
  --headed                    Show webview during E2E
  --devtools                  Open devtools in webview
```

### `@vertz/test` Exports (synthetic module)

```ts
import {
  describe, it, test,
  expect,
  beforeEach, afterEach, beforeAll, afterAll,
  mock, spyOn,
  vi,
  expectTypeOf,
} from '@vertz/test';
```

### Configuration

```ts
// vertz.config.ts
export default {
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.local.ts'],
    timeout: 10000,
    concurrency: 4,
    reporter: 'terminal',
    coverage: false,
    coverageThreshold: 95,
    preload: ['./test-setup.ts'],
  },
};
```

## Manifesto Alignment

- **Principle: Zero config, full power** — `vtz test` works out of the box with zero config, config file is optional
- **Principle: Familiar patterns** — API mirrors Vitest/Jest so developers don't need to learn new assertion patterns
- **Principle: LLM-first** — Clear documentation helps both humans and LLM agents understand the testing story

## Non-Goals

- This is NOT about changing any test runner behavior or API
- This is NOT about deprecating Vitest/Jest support (users can still use them via `vtz run`)
- No new packages or code changes — docs only

## Unknowns

None identified.

## Type Flow Map

N/A — documentation only.

## E2E Acceptance Test

After implementation, a developer reading the docs should be able to:

1. Understand that `vtz test` is the built-in test runner (not Vitest/Jest)
2. Write a test file using `@vertz/test` imports
3. Configure the test runner via `vertz.config.ts`
4. Know the difference between `vtz test` (V8), `vtz run` (shell), and `vtz exec` (shell)
5. Navigate from test runner docs to server testing and E2E testing

## Implementation Plan

### Phase 1: New Test Runner Page + Navigation

**Files:**
- `packages/mint-docs/guides/testing-unit.mdx` (new)
- `packages/mint-docs/docs.json` (modify)

**Content outline for `testing-unit.mdx`:**

```
---
title: Test Runner
description: 'Built-in test runner with Vitest-compatible API, watch mode, and code coverage'
---

## Overview
- vtz test is the built-in V8 test runner — no extra install needed
- Vitest-compatible API (describe, it, expect, mock, spyOn)
- @vertz/test is a synthetic module resolved by the runtime

## Quick Start
- Example: create a .test.ts file, import from @vertz/test, run vtz test

## Writing Tests
- describe / it / test
- Modifiers: .skip, .only, .todo, .skipIf, .each
- Hooks: beforeEach, afterEach, beforeAll, afterAll

## Assertions (expect)
Show 3-4 practical examples covering common matchers, then note:
"The full API is compatible with Vitest — see Vitest expect docs for exhaustive reference."

Categories to cover with examples:
- Equality: toBe, toEqual, toStrictEqual
- Truthiness: toBeTruthy, toBeFalsy, toBeNull, toBeUndefined, toBeDefined
- Numbers: toBeGreaterThan, toBeGreaterThanOrEqual, toBeLessThan, toBeLessThanOrEqual, toBeCloseTo, toBeNaN
- Types: toBeTypeOf, toBeFunction, toBeArray, toBeInstanceOf
- Strings & Arrays: toContain, toContainEqual, toMatch, toHaveLength
- Objects: toHaveProperty, toMatchObject
- Errors: toThrow, toThrowError
- Custom: toSatisfy
- Negation: .not
- Async: .resolves, .rejects
- Mock matchers: toHaveBeenCalled, toHaveBeenCalledOnce, toHaveBeenCalledTimes, toHaveBeenCalledWith, toHaveBeenLastCalledWith, toHaveBeenNthCalledWith
- Asymmetric: expect.any, expect.anything, expect.objectContaining, expect.arrayContaining, expect.stringContaining, expect.stringMatching

## Mocking
- mock(fn?) — create mock functions
- mock.module(path, factory) — Bun-compatible module mocking
- spyOn(obj, method) — spy on methods
- Mock methods: mockReturnValue, mockReturnValueOnce, mockImplementation, mockImplementationOnce, mockResolvedValue, mockResolvedValueOnce, mockRejectedValue, mockRejectedValueOnce
- Mock cleanup: mockReset, mockClear, mockRestore
- Mock inspection: .mock.calls, .mock.results, .mock.lastCall
- vi namespace (Vitest compatibility):
  - Mock management: vi.fn, vi.spyOn, vi.clearAllMocks, vi.resetAllMocks, vi.restoreAllMocks
  - Module mocking: vi.mock, vi.hoisted, vi.importActual
  - Fake timers: vi.useFakeTimers, vi.useRealTimers, vi.advanceTimersByTime, vi.advanceTimersToNextTimer, vi.runAllTimers, vi.runOnlyPendingTimers, vi.setSystemTime, vi.getTimerCount, vi.isFakeTimers

## Configuration
- vertz.config.ts test section
- All fields with examples

## CLI Reference
- All options with examples

## Coming from Vitest/Jest
- Side-by-side comparison table (Vitest | Vertz) for import, config, run command
- "What stays the same" callout — describe/it/expect/mock all work identically
- Key differences:
  - Import from '@vertz/test' instead of 'vitest'
  - Runs in V8, not Node.js
  - Built into the runtime (no install needed)
- vtz migrate-tests (--dry-run, --verbose) converts bun:test imports — before/after example
- Note: snapshot testing (toMatchSnapshot) is not currently supported

## Troubleshooting
- "Cannot find module '@vertz/test'" → running with wrong runner, use vtz test
- Coverage output location and format (LCOV)

## Next Steps
- Cards linking to Server Testing, E2E Testing
```

**Navigation change in `docs.json`:**
```json
{
  "group": "Testing",
  "pages": ["guides/testing-unit", "guides/testing-server", "guides/testing"]
}
```

### Phase 2: Runtime Page Updates

**Files:**
- `packages/mint-docs/runtime.mdx` (modify)

**Changes:**
1. Add "Architecture" section after "How it works" explaining the three modes:
   - **V8-powered commands:** `vtz dev` (dev server + SSR), `vtz test` (test runner) — these run JavaScript in the built-in V8 engine
   - **Shell commands:** `vtz run <script>`, `vtz exec <cmd>` / `vtzx` — these spawn child processes through the system shell, with `node_modules/.bin` on PATH
   - **Package management:** `vtz install`, `vtz add`, `vtz remove`, `vtz update` — native Rust dependency resolution
2. Expand `vtz run` and `vtz exec` descriptions to clarify they spawn shell processes
3. Add note about `vtz test` being the recommended way to run tests

### Phase 3: Cross-References + Rename E2E Page

**Files:**
- `packages/mint-docs/guides/testing-server.mdx` (modify)
- `packages/mint-docs/guides/testing.mdx` → rename to `guides/testing-e2e.mdx` (for naming consistency)
- `packages/mint-docs/guides/llm-quick-reference.mdx` (modify)
- `packages/mint-docs/docs.json` (modify — update page path + add redirect)

**Changes:**
1. `testing-server.mdx`: Add intro paragraph explaining `@vertz/test` is the built-in test module, with link to test runner page
2. Rename `testing.mdx` to `testing-e2e.mdx` for consistency with `testing-unit.mdx` and `testing-server.mdx`; add redirect from old path in `docs.json`
3. `testing-e2e.mdx`: Add note at top clarifying this is for E2E browser tests, link to test runner page for unit tests
4. `llm-quick-reference.mdx`: Add mention of `vtz test` and link to test runner page in the Testing section
5. Update `docs.json` navigation: `["guides/testing-unit", "guides/testing-server", "guides/testing-e2e"]`

## Review Sign-offs

- **DX:** APPROVED (suggestions incorporated: comparison table, prominent @vertz/test callout, troubleshooting section)
- **Product/Scope:** APPROVED (suggestions incorporated: practical examples over exhaustive listings, E2E page rename)
- **Technical:** CHANGES REQUESTED → RESOLVED (fixed: --preload→--no-preload, added --root-dir, complete matchers list, full vi namespace, mock.module)
