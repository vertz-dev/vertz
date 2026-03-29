# Vertz Test Runner — Design Document

> "If the runtime is too slow, we build a faster one." — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-28 | Initial draft |
| 2 | 2026-03-28 | Address 6 blockers from DX, Product, and Technical reviews: `@vertz/test` package, drop `vi` namespace, split Phase 4, add preconditions, Isolate pool model, CDP coverage |

---

## Executive Summary

Build a **built-in test runner** (`vertz test`) into the Vertz native runtime that replaces `bun test` as the framework's test execution engine. This eliminates the last Bun dependency in the developer workflow: install → dev → **test** → build → deploy — all from the single `vertz` binary.

The test runner reuses the runtime's existing infrastructure: V8 via deno_core, native oxc compiler, module loader, file watcher, and module graph. It's not a general-purpose test framework — it runs Vertz test suites with `bun:test`-compatible APIs, migrated to `@vertz/test`.

**Scope:** This document covers the test runner only. E2E browser testing (`vertz test --e2e`) is Phase 2 of the runtime and is addressed separately.

---

## Preconditions

1. **Isolate pool viability (POC 1).** The test runner creates an Isolate pool (N = CPU cores). Each Isolate is reused across test files with a global reset between files. This must be validated before timeline estimates are reliable. deno_core's `JsRuntime` creates full V8 Isolates, not lightweight contexts — the pool strategy bounds memory at N × 20MB.

2. **V8 coverage via Inspector Protocol (POC 2).** Coverage collection uses V8's Inspector Protocol (CDP `Profiler.startPreciseCoverage` / `Profiler.takePreciseCoverage`), not a direct V8 API. deno_core exposes `JsRuntime::inspector()` for this. Must validate source map range mapping works correctly.

3. **Native compiler is stable.** Phase 0 is complete (PR #1987). The test runner uses the same compiler pipeline.

---

## The Problem

### Today's Test Stack

```
Developer writes test → imports from bun:test → Bun compiles → Bun executes → Bun reports
```

Every step depends on Bun. The native Vertz runtime (`vertz dev`, `vertz build`) already replaces Bun for development and production, but developers still need Bun installed to run tests. This breaks the single-binary promise.

### Current Test Inventory (audited 2026-03-28)

| Type | Count |
|---|---|
| `.test.ts` files | 1,010 |
| `.test.tsx` files | 20 |
| `.local.ts` integration tests | 4 |
| `.test-d.ts` type tests | 86 |
| **Total** | **1,120** |

Across **22 packages**. Every package depends on `bun:test` for its test suite.

### APIs Actually Used

**Core (every test file):** `describe`, `it`/`test`, `expect`, `beforeEach`, `afterEach`

**Common:** `beforeAll`, `afterAll`, `mock`, `spyOn`, `vi.fn()`, `vi.spyOn()`

**Matchers (top 15 by frequency):**
| Matcher | Uses | Matcher | Uses |
|---|---|---|---|
| `toBe` | 13,729 | `toHaveBeenCalledWith` | 367 |
| `toContain` | 5,329 | `toBeInstanceOf` | 366 |
| `toEqual` | 2,550 | `toHaveBeenCalled` | 318 |
| `toHaveLength` | 1,239 | `toHaveProperty` | 253 |
| `toBeNull` | 1,120 | `toBeGreaterThan` | 241 |
| `toBeDefined` | 1,007 | `toHaveBeenCalledTimes` | 222 |
| `toThrow`/`toThrowError` | 573 | `toMatch` | 198 |
| `toBeUndefined` | 538 | | |

**Custom matchers (Vertz-specific):** `toJSONSchema` (140), `toBeTypeOf` (57), `toUpdate` (22), `toVNode` (20), `toMigrate` (18), `toLayoutTree` (14), `toTemplate` (10), `toBeFunction` (10)

**Not used:** Snapshot testing (`.toMatchSnapshot()`), inline snapshots

### Infrastructure Requirements

1. **Compiler plugin preload** — `.tsx` test files need the Vertz compiler (signal transforms, JSX). Currently done via `test-compiler-plugin.ts` preload in `bunfig.toml`.
2. **DOM shim preload** — Browser tests need `document`, `window`, etc. Currently via `happydom.ts` preload.
3. **Type tests** — `.test-d.ts` files validate types via `tsc --noEmit`, not runtime execution.
4. **Coverage** — V8-native, per-file 95%+ threshold enforcement.

---

## API Surface

### CLI

```bash
vertz test                              # Run all tests
vertz test src/entities/                # Run tests in directory
vertz test src/entities/tasks.test.ts   # Run specific file
vertz test --filter "creates a task"    # Filter by test name
vertz test --watch                      # Watch mode — rerun on file change
vertz test --coverage                   # V8-native coverage report
vertz test --coverage-threshold 95      # Fail if any file below 95%
vertz test --timeout 30000              # Per-test timeout (default: 5000ms)
vertz test --reporter json              # JSON output (default: terminal)
vertz test --reporter junit             # JUnit XML (CI integration)
vertz test --concurrency 4              # Parallel test files (default: CPU cores)
vertz test --bail                       # Stop on first failure
vertz test --no-preload                 # Skip preload scripts
```

### Test API (`@vertz/test`)

```typescript
import {
  describe,
  it,
  test,        // alias for it
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  spyOn,
} from '@vertz/test';

describe('Task entity', () => {
  let taskService: TaskService;

  beforeEach(() => {
    taskService = createTaskService();
  });

  afterEach(() => {
    taskService.dispose();
  });

  it('creates a task with valid data', async () => {
    const task = await taskService.create({ title: 'Buy groceries' });
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Buy groceries');
    expect(task.status).toBe('todo');
  });

  it('rejects invalid data', () => {
    expect(() => taskService.create({ title: '' })).toThrow('Title is required');
  });
});
```

### Mocking API

**One way to mock** (Principle 2): `mock()` for creating tracked callables, `spyOn()` for intercepting object methods. No `vi` namespace — the codemod rewrites `vi.fn()` → `mock()` and `vi.spyOn()` → `spyOn()`.

```typescript
import { mock, spyOn } from '@vertz/test';

// mock() — create a tracked callable
const handler = mock(async (body: TaskInput) => ({ id: '1', ...body }));
await handler({ title: 'Test' });
expect(handler).toHaveBeenCalledWith({ title: 'Test' });
expect(handler).toHaveBeenCalledTimes(1);

// Object.assign pattern (used extensively in Vertz tests)
const createTask = Object.assign(
  mock(async (body: TaskInput) => ok({ id: '1', ...body })),
  { url: '/api/tasks', method: 'POST' as const },
);
await createTask({ title: 'Test' });
expect(createTask.url).toBe('/api/tasks');

// mock() with chaining — replaces vi.fn().mockReturnValue()
const fn = mock(() => 42);
fn.mockReturnValue(99);
fn.mockResolvedValue({ id: '1' });
fn.mockImplementation((x: number) => x * 2);

// spyOn() — spy on object methods
const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
  new Response(JSON.stringify({ items: [] })),
);
await fetch('/api/tasks');
expect(spy).toHaveBeenCalledWith('/api/tasks');
spy.mockRestore();
```

### Expect Matchers

```typescript
// Equality
expect(value).toBe(exact);                    // Object.is
expect(value).toEqual(deep);                  // Deep equality
expect(value).toContainEqual(item);           // Array contains deep-equal item

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(num).toBeGreaterThan(n);
expect(num).toBeGreaterThanOrEqual(n);
expect(num).toBeLessThan(n);
expect(num).toBeLessThanOrEqual(n);
expect(num).toBeCloseTo(n, digits);

// Strings
expect(str).toContain(substring);
expect(str).toMatch(pattern);                 // string or RegExp
expect(str).toHaveLength(n);

// Arrays & Objects
expect(arr).toContain(item);                  // Array includes (===)
expect(arr).toHaveLength(n);
expect(obj).toHaveProperty(key, value?);
expect(val).toBeInstanceOf(Class);
expect(val).toBeTypeOf(typeStr);              // typeof check

// Functions
expect(fn).toBeFunction();

// Errors
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('message');
expect(() => fn()).toThrow(ErrorClass);
expect(() => fn()).toThrowError(/pattern/);

// Mock tracking
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledOnce();
expect(mockFn).toHaveBeenCalledTimes(n);
expect(mockFn).toHaveBeenCalledWith(...args);
expect(mockFn).toHaveBeenLastCalledWith(...args);

// Negation
expect(value).not.toBe(other);
expect(value).not.toContain(item);
// ... every matcher supports .not

// Async
expect(promise).resolves.toBe(value);
expect(promise).rejects.toThrow();
```

### Custom Matchers API

```typescript
import { expect } from '@vertz/test';

// Extend expect with custom matchers
expect.extend({
  toJSONSchema(received, schema) {
    const valid = validate(received, schema);
    return {
      pass: valid,
      message: () => `Expected value to match JSON schema`,
    };
  },
});

// Usage
expect(response.body).toJSONSchema(taskSchema);
```

### Configuration (`vertz.config.ts`)

```typescript
import { defineConfig } from '@vertz/cli';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Preload scripts (run before any test file)
    preload: [
      './test-compiler-plugin.ts',   // Vertz compiler for .tsx
      './happydom.ts',                // DOM globals
    ],

    // Execution
    timeout: 5000,            // Per-test timeout (ms)
    concurrency: 'auto',      // 'auto' = CPU cores (default), or a number
    bail: false,              // Stop on first failure

    // Coverage
    coverage: {
      enabled: false,         // Enable with --coverage flag
      threshold: 95,          // Per-file minimum
      exclude: [
        '**/__tests__/**',
        '**/dist/**',
        '**/generated-*.ts',
      ],
    },

    // Reporters
    reporters: ['terminal'],  // 'terminal' | 'json' | 'junit'
  },
});
```

### Preload System

Preload scripts execute before any test file, in the same V8 runtime. They're simple scripts — no plugin API.

```typescript
// setup.ts — Register DOM globals for component tests
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost/' });
```

```typescript
// custom-matchers.ts — Register custom expect matchers
import { expect } from '@vertz/test';
expect.extend({
  toJSONSchema(received, schema) { /* ... */ },
});
```

**The native compiler handles `.tsx` directly — no compiler preload needed.** In the Bun era, a `test-compiler-plugin.ts` preload was required to transform `.tsx` files. In the Vertz runtime, the compiler pipeline processes `.tsx` automatically during test file compilation. Preloads exist only for: (1) DOM shim setup, (2) custom matcher registration.

### Migration Path

**Codemod:** `vertz migrate-tests` rewrites all test files:

```diff
- import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
+ import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from '@vertz/test';
```

```diff
- import { vi } from 'bun:test';
- const fn = vi.fn(() => 42);
- const spy = vi.spyOn(console, 'log');
+ import { mock, spyOn } from '@vertz/test';
+ const fn = mock(() => 42);
+ const spy = spyOn(console, 'log');
```

**Migration checklist (what the codemod transforms):**
1. `bun:test` → `@vertz/test` import specifier
2. `vi.fn(impl)` → `mock(impl)` / `vi.fn()` → `mock()`
3. `vi.fn().mockReturnValue(x)` → `mock(() => x)`
4. `vi.fn().mockResolvedValue(x)` → `mock(async () => x)`
5. `vi.spyOn(obj, method)` → `spyOn(obj, method)`
6. `Bun.file(path).text()` in preloads → `await readFile(path, 'utf-8')` (or native compiler handles `.tsx` directly — preload may be unnecessary)
7. Custom matchers: port `expect.extend()` calls (same API, just different import)
8. `bunfig.toml` `[test]` → `vertz.config.ts` `test` field

**Config migration:** `bunfig.toml` `[test]` section → `vertz.config.ts` `test` field.

**Incremental migration:** Both `bun test` and `vertz test` can coexist during migration. Packages are migrated one at a time. Once a file is migrated to `@vertz/test` imports, it only runs under `vertz test`. Keep `bun test` available as a fallback until per-package parity is confirmed.

### TypeScript Resolution

`@vertz/test` is a real npm package (thin — contains only type declarations and a runtime shim). It ships with the framework:

```json
// packages/test/package.json
{
  "name": "@vertz/test",
  "types": "./types.d.ts",
  "exports": {
    ".": "./index.ts"
  }
}
```

When running under the Vertz runtime, the module loader intercepts `@vertz/test` imports and provides the native test framework (Rust-backed ops). When running under Bun/Node (during migration), the package re-exports compatible shims.

This ensures: (1) TypeScript resolves types correctly with zero config, (2) IDEs show autocompletion, (3) LLMs generate correct `@vertz/test` imports following the `@vertz/*` convention.

---

## Architecture

### How It Fits Into the Runtime

```
┌──────────────────────────────────────────────────────┐
│                  Vertz Runtime (Rust)                  │
│                                                        │
│  ┌─────────┐  ┌─────────┐  ┌──────────────────────┐  │
│  │ vertz   │  │ vertz   │  │ vertz test           │  │
│  │ dev     │  │ build   │  │ (NEW)                │  │
│  └────┬────┘  └────┬────┘  └────┬─────────────────┘  │
│       │            │            │                      │
│  ┌────┴────────────┴────────────┴──────────────────┐  │
│  │              Shared Infrastructure               │  │
│  │                                                  │  │
│  │  Native Compiler (oxc)     Module Loader         │  │
│  │  V8 Runtime (deno_core)    Module Graph          │  │
│  │  File Watcher (notify)     Compilation Cache     │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

The test runner is a **new orchestration layer** that combines existing runtime components. No new low-level infrastructure needed.

### Execution Pipeline

```
vertz test
│
├── 1. Parse CLI args (TestArgs)
│     --filter, --watch, --coverage, --timeout, --concurrency
│
├── 2. Load config (vertz.config.ts or bunfig.toml fallback)
│     test.include, test.exclude, test.preload, test.timeout
│
├── 3. Discover test files
│     Glob patterns → filter by include/exclude → sort by path
│     Result: Vec<PathBuf> of test files to run
│
├── 4. Build module graph (for --watch, coverage)
│     Parse imports of each test file → record dependencies
│     Same SharedModuleGraph used by dev server
│
├── 5. Execute preload scripts (if configured)
│     Create shared V8 runtime → run preloads → keep state
│     Compiler plugin, DOM shim, custom matchers
│
├── 6. Execute test files (parallel across files)
│     For each test file:
│     ├── Create V8 context (isolated from other test files)
│     ├── Inject test globals (describe, it, expect, mock, etc.)
│     ├── Compile with native compiler (.tsx → .js)
│     ├── Load module + transitive imports
│     ├── Registration phase: describe/it callbacks collected
│     ├── Execution phase: run beforeAll → tests → afterAll
│     │   Within each test:
│     │   ├── Run beforeEach hooks
│     │   ├── Execute test function (with timeout)
│     │   ├── Run afterEach hooks (even if test throws)
│     │   └── Record result (pass/fail/skip + duration)
│     └── Collect coverage data (if --coverage)
│
├── 7. Aggregate results
│     Total: passed, failed, skipped, duration
│     Per-file: test count, coverage %
│
├── 8. Report
│     Terminal: colored output with pass/fail summary
│     JSON: machine-readable results
│     JUnit: CI-compatible XML
│
└── 9. Exit
      Exit code 0 if all pass + coverage thresholds met
      Exit code 1 if any failure or threshold violation
```

### Test Isolation Model — Isolate Pool

deno_core's `JsRuntime` creates full V8 Isolates (not lightweight contexts). Creating 1,010 Isolates simultaneously would use 10-30GB of memory. Instead, the test runner uses an **Isolate pool**:

```
vertz test (Isolate Pool: N = CPU cores)
│
├── Worker 0 (OS thread + JsRuntime)
│   ├── File A.test.ts → execute → reset globals → next file
│   ├── File D.test.ts → execute → reset globals → next file
│   └── ...
│
├── Worker 1 (OS thread + JsRuntime)
│   ├── File B.test.ts → execute → reset globals → next file
│   └── ...
│
├── Worker 2 (OS thread + JsRuntime)
│   ├── File C.test.ts → execute → reset globals → next file
│   └── ...
│
└── Worker N-1 (OS thread + JsRuntime)
    └── ...
```

- **Between files:** Each file runs in its own Isolate via the pool. After execution, the Isolate's global state is reset (module cache cleared, timers cancelled, test state wiped). This gives practical isolation while capping memory at N × 20MB.
- **Within a file:** Sequential by default. Tests share beforeEach/afterEach state as expected.
- **Concurrency:** N = CPU cores by default. Configurable via `--concurrency N`.
- **Timer cleanup:** Each test gets a timer scope. On test completion (pass or fail), all pending timers in that scope are cancelled — prevents test hangs.
- **Global reset between files:** Clear module cache, cancel timers, reset test globals (describe/it/expect state), wipe globalThis mutations. Same pattern used for SSR Isolate reuse in the dev server.

### Coverage Architecture — V8 Inspector Protocol

V8 coverage is accessed via the **Inspector Protocol (CDP)**, not a direct V8 API. deno_core exposes `JsRuntime::inspector()` for connecting to V8's Inspector.

```
Per-Isolate Coverage Flow:
│
├── 1. Open Inspector session
│     let session = runtime.inspector().create_local_session();
│
├── 2. Enable precise coverage via CDP
│     session.post("Profiler.enable")
│     session.post("Profiler.startPreciseCoverage", {
│       callCount: true, detailed: true
│     })
│
├── 3. Execute test file (tests run normally)
│
├── 4. Collect coverage ranges
│     let result = session.post("Profiler.takePreciseCoverage")
│     // Returns: { result: [{ scriptId, url, functions: [{ ranges }] }] }
│
├── 5. Map compiled JS byte offsets → TypeScript lines via source maps
│     // Uses sourcemap crate for range mapping (start/end pairs)
│     // Extends existing source_mapper.rs (which handles single positions)
│
├── 6. Aggregate per-file: line coverage, branch coverage
│
└── 7. Apply threshold check (95% per-file default)
```

No Istanbul, no source instrumentation. V8's precise coverage is statement-level and branch-level. Source maps from the native compiler map coverage ranges back to original TypeScript.

### Watch Mode Architecture

```
vertz test --watch
│
├── Initial run: execute all matching test files
│
├── File watcher (notify crate, already exists)
│   └── On change: src/entities/tasks.ts
│
├── Module graph lookup
│   └── tasks.ts is imported by: tasks.test.ts, task-service.test.ts
│
├── Re-run ONLY affected test files
│   ├── tasks.test.ts (re-compile, re-execute)
│   └── task-service.test.ts (re-compile, re-execute)
│
└── Report delta (what changed, what passed/failed)
```

Reuses the runtime's existing `FileWatcher` (notify crate, 20ms debounce) and `ModuleGraph` (dependency tracking). Only affected tests re-run — not the entire suite.

### Type Test Handling (`.test-d.ts`)

Type test files are **not executed by the test runner**. They are validated by:

1. `vertz test` discovers `.test-d.ts` files
2. Passes them to `tsc --noEmit` (or `tsgo` if available)
3. If `@ts-expect-error` directives are unused → type test fails
4. If type errors occur on lines without `@ts-expect-error` → type test fails
5. Results reported alongside runtime tests

This matches the current behavior where `.test-d.ts` files are checked by `bun run typecheck`, not `bun test`.

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"

The test runner uses the same compiler pipeline as `vertz dev` and `vertz build`. If a component compiles and passes tests, it will work at runtime. No divergence between test compilation and production compilation.

### Principle 2: "One way to do things"

One test command: `vertz test`. One assertion library. One mocking API. No decision fatigue about Jest vs Vitest vs Bun test vs Mocha.

### Principle 3: "AI agents are first-class users"

The test runner's output formats (terminal, JSON, JUnit) are parseable by AI agents. Structured error output (file, line, expected, actual) lets agents diagnose and fix test failures without interpreting human-readable text.

### Principle 7: "Performance is not optional"

Native Rust test orchestration. Isolate pool (N = CPU cores) for bounded memory. Parallel file execution. Module-graph-aware watch mode re-runs only affected tests.

### Principle 8: "No ceilings"

If Bun's test runner is too slow or too opaque, we build our own. The runtime owns the entire pipeline: compilation, execution, coverage, reporting.

### What was rejected

- **Vitest as a dependency** — Adds Node.js/Vite dependency, defeats single-binary goal.
- **Jest compatibility layer** — Too large an API surface, too many edge cases. Bun:test surface is smaller and matches our codebase.
- **Separate test binary** — Must be part of the `vertz` binary for the single-tool experience.
- **WASM-based test isolation** — V8 contexts are lighter and faster than WASM boundaries for test isolation.

---

## Non-Goals

1. **General-purpose test framework.** This runs Vertz test suites, not arbitrary Node.js projects.
2. **Jest plugin compatibility.** No jest-extended, no jest-dom, no jest transforms. Custom matchers via `expect.extend()` only.
3. **Browser test environment (JSDOM/Happy-DOM built-in).** DOM shim is a preload responsibility, not built into the runner. Long-term, the runtime's own DOM environment (Phase 4) replaces this.
4. **Snapshot testing.** Not used in the Vertz codebase (0 uses audited). If needed later, add as a future phase.
5. **Code transformation plugins.** The native compiler handles `.tsx` transformation. No Babel/SWC plugin system.
6. **`bun:test` bug-for-bug compatibility.** We match the documented API surface, not undocumented behaviors.
7. **E2E browser testing.** Covered by `vertz test --e2e` in the runtime Phase 2 doc, not this plan.
8. **Full vitest `vi` namespace.** The codebase uses `mock()` + `spyOn()` (64 files) not `vi.*` (8 files). The codemod rewrites `vi.fn()` → `mock()` and `vi.spyOn()` → `spyOn()`. No `vi.mock()`, `vi.hoisted()`, `vi.stubGlobal()`, etc.
9. **Preload plugin API.** Preloads are simple scripts that execute before tests. No Bun-compatible `plugin({ setup(build) { build.onLoad(...) } })` API. The native compiler handles `.tsx` directly — preloads exist only for DOM shim setup and custom matcher registration during migration. New projects don't need them.

---

## Unknowns

### U1: Isolate pool reset correctness — NEEDS POC

**Question:** Can we reliably reset a deno_core `JsRuntime` between test files without creating a new Isolate?
**Context:** The Isolate pool reuses N JsRuntimes across 1,010+ test files. Between files, we must clear: module cache, globalThis mutations, pending timers, test framework state. If any state leaks, tests become order-dependent. The dev server already resets SSR Isolates — validate that the same approach works for test files.
**Resolution:** Build POC with 2 JsRuntimes processing 10 test files each. Verify: (1) global mutations in file A don't affect file B, (2) module cache is fully cleared, (3) timers are cancelled. Target: 1-2 days.

### U2: V8 coverage via Inspector Protocol — NEEDS POC

**Question:** Can we collect precise coverage through deno_core's Inspector API and map it back to TypeScript via source maps?
**Context:** V8 coverage is accessed via the Inspector Protocol (CDP). deno_core exposes `JsRuntime::inspector()`. We need to: (1) open a local session, (2) send `Profiler.startPreciseCoverage`, (3) collect ranges after test execution, (4) map byte offsets in compiled JS to line/column in TypeScript via source maps. The existing `source_mapper.rs` handles single positions (stack traces) but coverage needs range mapping (start/end pairs).
**Resolution:** Build POC: enable coverage on one JsRuntime, execute a test file, collect coverage, map to TypeScript. Validate line numbers match. Target: 1-2 days.

### U3: Preload plugin compatibility — NEEDS AUDIT

**Question:** Do existing Bun preload plugins (`test-compiler-plugin.ts`) use Bun-specific APIs beyond `plugin()` and `Bun.file()`?
**Context:** The native runtime already compiles `.tsx` files. Preload plugins may be unnecessary long-term, but for migration they need to work. If plugins use Bun-specific APIs (like `Bun.file()`, `Bun.write()`), we need shims.
**Resolution:** Audit all preload scripts across the monorepo. List every Bun-specific API used. Determine: which can be shimmed, which can be replaced by native compiler integration.

---

## POC Results

*No POCs completed yet. Planned:*

### POC 1: Isolate Pool Reset (resolves U1)

- Create 2 deno_core JsRuntimes, each processing 10 test files sequentially
- Between files: clear module cache, reset globalThis, cancel timers
- Validate: global mutations in file A don't affect file B
- Validate: module-level state (top-level `let`) is fresh per file
- Measure: reset time between files, memory stability over 10 cycles
- Target: 1-2 days

### POC 2: Inspector Protocol Coverage (resolves U2)

- Open Inspector session on a deno_core JsRuntime
- Send `Profiler.startPreciseCoverage` / `Profiler.takePreciseCoverage` via CDP
- Execute a TypeScript file (compiled by native compiler)
- Collect coverage ranges (byte offsets in compiled JS)
- Map to original TypeScript via source maps (range mapping, not just single positions)
- Validate: line numbers match original TypeScript
- Target: 1-2 days

---

## Type Flow Map

The test runner has minimal generic type flow — it's a runtime tool, not a type-level API. The key type contract is:

```
@vertz/test module
├── describe(name: string, fn: () => void): void
├── it(name: string, fn: () => void | Promise<void>): void
├── expect<T>(actual: T): Matchers<T>
│   └── Matchers<T> (conditional methods based on T)
│       ├── T extends Function → toHaveBeenCalled(), etc.
│       ├── T extends number → toBeGreaterThan(n), etc.
│       └── any T → toBe(), toEqual(), etc.
├── mock<T extends Function>(impl: T): T & MockTracker
└── spyOn<T, K extends keyof T>(obj: T, method: K): SpyInstance
```

**Type test for the test API itself:**

```typescript
// vertz-test.test-d.ts
import { expect, mock, spyOn } from '@vertz/test';

// Positive: expect returns correct matcher type
const m = expect(42);
m.toBe(42);        // ✓
m.toBeGreaterThan(41); // ✓

// @ts-expect-error — mock tracking methods only on mock functions
expect(42).toHaveBeenCalled();

// @ts-expect-error — spyOn requires valid method name
spyOn(console, 'nonexistent');

// Positive: mock preserves function signature
const fn = mock((a: string, b: number) => true);
fn('hello', 42);   // ✓
// @ts-expect-error — wrong argument types
fn(42, 'hello');
```

---

## E2E Acceptance Test

### Test 1: Core Test Execution

```typescript
describe('Feature: vertz test runs test files', () => {
  describe('Given a Vertz project with .test.ts files', () => {
    describe('When running vertz test', () => {
      it('Then discovers and executes all test files', async () => {
        const result = await exec('vertz test', { cwd: projectDir });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('passed');
        expect(result.stdout).toContain('files');
      });

      it('Then processes .test.tsx files with the native compiler', async () => {
        const result = await exec('vertz test src/components/__tests__/task-card.test.tsx', {
          cwd: projectDir,
        });
        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe('Given a test file with a failing assertion', () => {
    describe('When running vertz test', () => {
      it('Then exits with code 1 and shows the failure', async () => {
        const result = await exec('vertz test src/__tests__/failing.test.ts', {
          cwd: projectDir,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('expected');
        expect(result.stdout).toContain('received');
      });
    });
  });

  describe('Given a test with a timeout', () => {
    describe('When the test exceeds the timeout', () => {
      it('Then fails with a timeout error', async () => {
        const result = await exec('vertz test --timeout 100 src/__tests__/slow.test.ts', {
          cwd: projectDir,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('timeout');
      });
    });
  });
});
```

### Test 2: Mocking and Spying

```typescript
describe('Feature: mock() and spyOn() work identically to bun:test', () => {
  describe('Given a test using mock() with Object.assign', () => {
    describe('When the mock is called and tracked', () => {
      it('Then preserves both callable behavior and metadata properties', async () => {
        // This is a critical Vertz pattern — mock is both function + metadata
        const result = await exec('vertz test src/__tests__/mock-assign.test.ts', {
          cwd: projectDir,
        });
        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe('Given a test using spyOn(globalThis, "fetch")', () => {
    describe('When fetch is called in the test', () => {
      it('Then the spy intercepts and tracks the call', async () => {
        const result = await exec('vertz test src/__tests__/spy-fetch.test.ts', {
          cwd: projectDir,
        });
        expect(result.exitCode).toBe(0);
      });
    });
  });
});
```

### Test 3: Coverage

```typescript
describe('Feature: V8-native coverage collection', () => {
  describe('Given vertz test --coverage', () => {
    describe('When tests complete', () => {
      it('Then reports per-file coverage mapped to TypeScript', async () => {
        const result = await exec('vertz test --coverage', { cwd: projectDir });
        // Coverage output shows original .ts file paths, not compiled .js
        expect(result.stdout).toMatch(/src\/entities\/tasks\.ts\s+\d+(\.\d+)?%/);
      });
    });
  });

  describe('Given --coverage-threshold 95 and a file at 80%', () => {
    describe('When tests complete', () => {
      it('Then exits with code 1 and reports the violation', async () => {
        const result = await exec('vertz test --coverage --coverage-threshold 95', {
          cwd: lowCoverageProjectDir,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('below threshold');
      });
    });
  });
});
```

### Test 4: Watch Mode

```typescript
describe('Feature: watch mode with module-graph-aware re-runs', () => {
  describe('Given vertz test --watch is running', () => {
    describe('When a source file changes', () => {
      it('Then re-runs only test files that import the changed file', async () => {
        const watcher = exec('vertz test --watch', { cwd: projectDir, background: true });
        await watcher.waitForOutput(/watching/i, 5000);

        // Edit a source file
        await editFile(join(projectDir, 'src/entities/tasks.ts'), (code) =>
          code.replace('// marker', '// marker-changed'),
        );

        const output = await watcher.waitForOutput(/re-running/i, 2000);
        // Only tasks-related tests re-run
        expect(output).toContain('tasks.test.ts');
        // Unrelated tests don't re-run
        expect(output).not.toContain('comments.test.ts');
      });
    });
  });
});
```

### Test 5: Parity with bun test

```typescript
describe('Feature: vertz test produces identical results to bun test', () => {
  describe('Given the @vertz/server test suite (migrated to @vertz/test)', () => {
    describe('When running vertz test', () => {
      it('Then all tests that pass with bun test also pass with vertz test', async () => {
        // Run with bun test (baseline)
        const bunResult = await exec('bun test', { cwd: serverPkgDir });

        // Run with vertz test (same files, migrated imports)
        const vertzResult = await exec('vertz test', { cwd: serverPkgDir });

        // Same pass/fail count
        expect(vertzResult.passCount).toBe(bunResult.passCount);
        expect(vertzResult.failCount).toBe(bunResult.failCount);
      });
    });
  });
});
```

---

## Phased Implementation Plan

### Phase 1: Core Runner — Thinnest E2E Slice (2-3 weeks)

**Goal:** `vertz test` discovers, compiles, and executes a single `.test.ts` file. Prove the pipeline works end-to-end.

**Deliverables:**
- `Command::Test(TestArgs)` in CLI (`src/cli.rs`)
- Test file discovery via glob patterns (`src/test/collector.rs`)
- Test globals injection: `describe`, `it`, `expect` with top 10 matchers (`toBe`, `toEqual`, `toContain`, `toHaveLength`, `toBeNull`, `toBeDefined`, `toBeUndefined`, `toThrow`, `toBeInstanceOf`, `toHaveProperty`)
- `beforeEach`, `afterEach` hooks
- `it.skip()`, `it.only()`, `describe.skip()`, `describe.only()`, `it.todo()` modifiers
- Isolate pool (N = CPU cores) with global reset between files
- Sequential execution within a file
- Terminal reporter (pass/fail/skip/todo/duration)
- Proper exit codes (0 = all pass, 1 = any fail)

**Acceptance Criteria:**

```typescript
describe('Feature: Core test runner', () => {
  describe('Given a .test.ts file with describe/it/expect', () => {
    describe('When running vertz test <file>', () => {
      it('Then compiles and executes the test file', () => {});
      it('Then reports pass/fail for each test', () => {});
      it('Then exits 0 on all pass, 1 on any fail', () => {});
    });
  });

  describe('Given a test file importing a .tsx component', () => {
    describe('When running vertz test', () => {
      it('Then compiles the .tsx import with the native compiler', () => {});
    });
  });

  describe('Given two test files', () => {
    describe('When running vertz test', () => {
      it('Then each file runs in an isolated V8 context', () => {});
      it('Then global mutations in file A do not affect file B', () => {});
    });
  });

  describe('Given a test with beforeEach/afterEach', () => {
    describe('When the test throws', () => {
      it('Then afterEach still runs (cleanup guaranteed)', () => {});
    });
  });
});
```

**Integration test (written as failing RED test first):**
```bash
# Create a minimal test file, run vertz test, verify output
echo 'import { describe, it, expect } from "@vertz/test";
describe("math", () => {
  it("adds", () => { expect(1 + 1).toBe(2); });
  it("fails", () => { expect(1 + 1).toBe(3); });
});' > /tmp/test-project/math.test.ts

vertz test /tmp/test-project/math.test.ts
# Expected: 1 passed, 1 failed, exit code 1
```

---

### Phase 2: Full Compatibility — Matchers, Mocking, Parallel (2-3 weeks)

**Goal:** Complete the matcher library and mocking API. Run test files in parallel. Handle the full `bun:test` API surface used by Vertz.

**Deliverables:**
- Remaining matchers: `toMatch`, `toContainEqual`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual`, `toBeCloseTo`, `toBeTruthy`, `toBeFalsy`, `toBeTypeOf`, `toBeFunction`, `toHaveBeenCalled`, `toHaveBeenCalledOnce`, `toHaveBeenCalledTimes`, `toHaveBeenCalledWith`, `toHaveBeenLastCalledWith`, `toThrowError`
- `.not` negation for all matchers
- `.resolves` / `.rejects` for async matchers
- `mock()` factory with call tracking
- `spyOn()` with `mockImplementation`, `mockReturnValue`, `mockResolvedValue`, `mockResolvedValueOnce`, `mockRestore`
- `vi` namespace (`vi.fn()`, `vi.spyOn()`)
- `Object.assign(mock(...), metadata)` pattern support
- `beforeAll` / `afterAll` hooks
- `test()` alias for `it()`
- `expect.extend()` custom matcher API
- Parallel test file execution (tokio task pool, configurable concurrency)
- Per-test timeout enforcement
- `--filter` flag for test name filtering
- `--bail` flag to stop on first failure

**Acceptance Criteria:**

```typescript
describe('Feature: Full bun:test API compatibility', () => {
  describe('Given the complete Vertz matcher library', () => {
    describe('When running a test that uses every matcher', () => {
      it('Then all matchers produce correct pass/fail results', () => {});
    });
  });

  describe('Given mock() with Object.assign', () => {
    describe('When the mock is called', () => {
      it('Then tracks calls AND preserves assigned properties', () => {});
    });
  });

  describe('Given spyOn(obj, method)', () => {
    describe('When mockRestore() is called', () => {
      it('Then the original method is restored', () => {});
    });
  });

  describe('Given 20 test files and --concurrency 4', () => {
    describe('When running vertz test', () => {
      it('Then runs 4 files in parallel, total time < sequential/4 + overhead', () => {});
    });
  });
});
```

---

### Phase 3: Coverage, Watch Mode, Type Tests (2-3 weeks)

**Goal:** V8-native coverage, module-graph-aware watch mode, `.test-d.ts` type test integration.

**Deliverables:**
- V8 precise coverage collection via deno_core/rusty_v8
- Source map mapping (compiled JS → original TypeScript)
- Per-file coverage percentage with threshold enforcement
- Coverage reporter (terminal + LCOV output)
- `--coverage` and `--coverage-threshold` flags
- Watch mode (`--watch`)
  - File watcher integration (reuse existing notify-based watcher)
  - Module graph for targeted re-runs (only affected tests)
  - Terminal UI: cleared screen, pass/fail counts, "watching for changes..."
  - Debounced re-run (20ms, matching dev server)
- `.test-d.ts` handling
  - Discover type test files
  - Run `tsc --noEmit` on them
  - Report unused `@ts-expect-error` as failures
  - Report unexpected type errors as failures
- JSON reporter (`--reporter json`)
- JUnit XML reporter (`--reporter junit`)

**Acceptance Criteria:**

```typescript
describe('Feature: Coverage + Watch + Type tests', () => {
  describe('Given --coverage on a project with 95%+ coverage', () => {
    describe('When tests complete', () => {
      it('Then reports per-file coverage mapped to .ts source lines', () => {});
      it('Then exits 0 when all files meet threshold', () => {});
    });
  });

  describe('Given --watch and a source file change', () => {
    describe('When the module graph shows 2 of 10 test files depend on the change', () => {
      it('Then re-runs only those 2 files within 100ms', () => {});
    });
  });

  describe('Given a .test-d.ts file with an unused @ts-expect-error', () => {
    describe('When running vertz test', () => {
      it('Then reports the type test as failed', () => {});
    });
  });
});
```

---

### Phase 4a: Codemod & Proof-of-Migration (2 weeks)

**Goal:** Build the migration codemod and validate it against 3 proof packages.

**Deliverables:**
- `vertz migrate-tests` codemod
  - Rewrites `bun:test` → `@vertz/test` imports
  - Rewrites `vi.fn()` → `mock()`, `vi.spyOn()` → `spyOn()`
  - Migrates `bunfig.toml` `[test]` → `vertz.config.ts` `test`
  - Ports custom matcher definitions (same `expect.extend()` API)
- `vertz.config.ts` test configuration support
- Preload system (simple script execution for DOM shim during migration)
- Migrate 3 proof packages:
  1. Smallest package (validate basic codemod)
  2. Package with mocking (validate mock/spy migration)
  3. Package with `.test.tsx` files (validate compiler integration)
- Per-package parity gate: run both `bun test` and `vertz test`, compare results

**Acceptance Criteria:**

```typescript
describe('Feature: Codemod and proof migration', () => {
  describe('Given vertz migrate-tests codemod', () => {
    describe('When run on a package with bun:test + vi.fn() imports', () => {
      it('Then rewrites all imports to @vertz/test', () => {});
      it('Then rewrites vi.fn() to mock() and vi.spyOn() to spyOn()', () => {});
      it('Then the migrated tests pass with vertz test', () => {});
    });
  });

  describe('Given 3 migrated proof packages', () => {
    describe('When running vertz test on each', () => {
      it('Then all tests that passed with bun test also pass', () => {});
    });
  });
});
```

---

### Phase 4b: Full Monorepo Rollout (2-3 weeks)

**Goal:** Migrate remaining 19-20 packages. Per-package parity gates. Update CI.

**Deliverables:**
- Migrate remaining packages incrementally (smallest → largest)
- Per-package parity validation: run both `bun test` and `vertz test`, compare results
- Fix any package-specific incompatibilities discovered during migration
- Update root `package.json` scripts: `"test": "vertz test"`
- Update CI workflow to use `vertz test`
- Remove `bun:test` dependency from all packages

**Acceptance Criteria:**

```typescript
describe('Feature: Full monorepo migration', () => {
  describe('Given the complete Vertz monorepo (1,010+ test files)', () => {
    describe('When running vertz test', () => {
      it('Then all tests that passed with bun test also pass with vertz test', () => {});
      it('Then total execution time is within 2x of bun test (hard fail at 2x)', () => {});
    });
  });
});
```

---

## Performance Targets

| Metric | Target | Bun reference |
|---|---|---|
| Test discovery + compilation (100 files) | < 200ms | ~300-500ms |
| Isolate global reset (between test files) | < 5ms | N/A |
| Single test file execution (excluding I/O) | < 50ms | ~30-50ms |
| Full suite (100 files, 500 tests) | < 5s | ~4-6s |
| Watch re-run (1 file changed) | < 100ms | ~200-300ms |
| Coverage collection overhead | < 10% | ~15-20% (Istanbul) |
| Mock function creation | < 1μs | ~1μs |

**Kill criterion:** If `vertz test` is >2x slower than `bun test` after Phase 3 optimization, re-evaluate the architecture (Isolate pool sizing, compilation caching, or V8 snapshot pre-loading).
| Mock function creation | < 1μs | ~1μs |

---

## Key Files (Implementation)

### New files to create

```
native/vertz-runtime/src/
├── test/
│   ├── mod.rs               # Test runner orchestration
│   ├── collector.rs          # Test file discovery (glob)
│   ├── executor.rs           # V8 context creation, test execution
│   ├── globals.rs            # Test globals injection (describe, it, expect)
│   ├── matchers.rs           # Expect matcher implementations
│   ├── mocking.rs            # mock(), spyOn(), vi namespace
│   ├── coverage.rs           # V8 coverage collection + source map mapping
│   ├── reporter/
│   │   ├── mod.rs            # Reporter trait
│   │   ├── terminal.rs       # Colored terminal output
│   │   ├── json.rs           # JSON reporter
│   │   └── junit.rs          # JUnit XML reporter
│   ├── watch.rs              # Watch mode (reuse file watcher + module graph)
│   └── config.rs             # Test configuration parsing
```

### Existing files to modify

| File | Change |
|---|---|
| `src/cli.rs` | Add `Command::Test(TestArgs)` variant |
| `src/main.rs` | Dispatch to `test::run()` |
| `src/config.rs` | Add `TestConfig` to `ServerConfig` |

### Existing infrastructure to reuse (no changes needed)

| Component | File | Purpose |
|---|---|---|
| V8 runtime | `src/runtime/js_runtime.rs` | Create Isolate pool for test execution |
| Module loader | `src/runtime/module_loader.rs` | Resolve + compile test imports |
| Native compiler | `src/compiler/pipeline.rs` | Compile .ts/.tsx test files |
| File watcher | `src/watcher/file_watcher.rs` | Watch mode |
| Module graph | `src/watcher/module_graph.rs` | Targeted re-runs |
| Compilation cache | `src/compiler/cache.rs` | Avoid recompiling unchanged files |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Isolate pool reset leaks state between test files | Medium | High | POC 1 validates. Fallback: create fresh Isolate per file (slower, bounded by pool size) |
| V8 coverage via Inspector Protocol is unreliable | Medium | Medium | POC 2 validates. Fallback: raw rusty_v8 bindings or source instrumentation |
| `bun:test` undocumented behaviors break migration | Medium | Medium | Migrate incrementally, validate parity per-package |
| Preload plugin compatibility | Low | Low | Native compiler handles `.tsx` directly — preloads are transitional |
| Custom matchers API surface insufficient | Low | Low | `expect.extend()` covers Vertz's 8 custom matchers |
| Watch mode flakiness (false positives/negatives) | Medium | Low | Reuse battle-tested file watcher from dev server |

---

## Definition of Done

- [ ] `vertz test` runs the full Vertz monorepo test suite (1,010+ files)
- [ ] All tests that pass with `bun test` also pass with `vertz test`
- [ ] V8-native coverage with per-file 95% threshold enforcement
- [ ] Watch mode re-runs only affected tests (< 100ms for single file change)
- [ ] `.test-d.ts` type tests validated via tsc
- [ ] Full suite execution within 2x of `bun test` time (hard fail criterion)
- [ ] `vertz migrate-tests` codemod handles all import patterns
- [ ] CI workflow updated to use `vertz test`
- [ ] Terminal reporter with clear pass/fail output
- [ ] JSON and JUnit reporters for CI integration
