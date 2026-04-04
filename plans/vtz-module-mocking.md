# Module Mocking in vtz Test Runner (`vi.mock` / `mock.module`)

**Issue:** #2255
**Status:** Design (Rev 2 — addresses DX, Product, and Technical review feedback)
**Author:** chennai

---

## Problem

The vtz test runner has `vi.mock()` and `mock.module()` as **stubs only** — they store the factory on `globalThis.__vertz_mocked_modules` but the module loader does NOT intercept imports to apply the mock. This is the **single biggest blocker** preventing migration from `bun test` to `vtz test`.

- **32 `vi.mock()` / `mock.module()` calls across 15 test files** depend on module mocking
- These files **cannot run on `vtz test`** without this feature

> **Note:** Plain function mocking (`vi.fn()`, `mock()`, `.mockResolvedValue()`, `.mockImplementation()`, `spyOn()`) already works in `vtz test`. This feature only addresses **module-level mocking** — intercepting `import` statements to return mock factories instead of real modules.

---

## API Surface

### `vi.mock(specifier, factory)` — Module-level mock registration (canonical API)

```ts
import { describe, it, expect, vi } from '@vertz/test';
import { createCompiler } from '@vertz/compiler';

vi.mock('@vertz/compiler', () => ({
  createCompiler: vi.fn(() => ({
    analyze: vi.fn().mockResolvedValue({ modules: [] }),
    compile: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

describe('build pipeline', () => {
  it('calls createCompiler', () => {
    const compiler = createCompiler();
    // `createCompiler` is the mock — not the real module
    expect(createCompiler).toHaveBeenCalled();
  });
});
```

### `mock.module(specifier, factory)` — Bun-compatible alias (soft-deprecated)

`mock.module()` is a compatibility alias for `vi.mock()`. New code should use `vi.mock()`. `mock.module()` will be documented only in a "Migrating from bun:test" section.

```ts
import { describe, it, mock } from '@vertz/test';

const mockEnd = mock().mockResolvedValue(undefined);

mock.module('postgres', () => ({
  default: mock(() => ({ end: mockEnd })),
}));
```

### `vi.hoisted(factory)` — Declare variables available in mock factories

```ts
import { vi } from '@vertz/test';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({ id: '1' }),
}));

vi.mock('@vertz/db', () => ({
  createRecord: mockCreate,
}));
```

### `vi.importActual(specifier)` — Load the real module from within a mock factory

```ts
vi.mock('@vertz/compiler', async () => {
  const actual = await vi.importActual('@vertz/compiler');
  return {
    ...actual,
    createCompiler: vi.fn(), // Override only this export
  };
});
```

### Invalid usage — compile-time errors

```ts
// Compile error: vi.mock() must be called at the module top level.
//   Move vi.mock() to the top of the file, and use mockFn.mockImplementation()
//   inside test blocks to change behavior per test.
function setup() {
  vi.mock('module', () => ({}));
}

// Compile error: vi.mock() requires a factory function.
//   Provide a factory: vi.mock('module', () => ({ ... }))
vi.mock('module');

// Compile warning: vi.mock('@vertz/compier') has no matching import in this file.
//   The mock will have no effect. Did you mean '@vertz/compiler'?
vi.mock('@vertz/compier', () => ({}));
```

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"

The compiler validates mock calls at build time:
- `vi.mock()` inside function bodies → compile error with actionable fix suggestion
- `vi.mock()` without factory → compile error
- `vi.mock('specifier')` with no matching import → compile warning (unused mock)
- Specifier typo → warning with "did you mean?" hint (if fuzzy match found)

### Principle 2: "One way to do things"

`vi.mock()` is the canonical API. `mock.module()` exists as a soft-deprecated alias for bun:test migration. Documentation shows only `vi.mock()` in examples; `mock.module()` is mentioned only in migration guides.

### Principle 3: "AI agents are first-class users"

Mock hoisting is invisible to the developer — you write `vi.mock()` anywhere at module level and the compiler handles ordering. An LLM writes the same code a human does. No special placement rules to remember.

### Principle 4: "Test what matters, nothing more"

Module mocking enables testing units in isolation. The factory pattern is explicit — you see exactly what's mocked and what isn't.

### Principle 7: "Performance is not optional"

The compiler transform is a single AST pass with zero runtime overhead. Mock interception happens at compile time via import rewriting — no Proxy, no runtime module graph traversal. The module loader is untouched.

### Principle 8: "No ceilings"

We own the compiler, the test runner, and the module loader. This gives us the ability to implement mock hoisting as a first-class feature rather than a hacky runtime workaround.

### What was rejected

1. **Runtime module loader interception** — Requires communication between JS (`globalThis.__vertz_mocked_modules`) and the Rust module loader during module graph resolution. ESM requires static export declarations, so returning dynamic mock results from `ModuleLoader::load()` would require pre-analyzing the original module's exports. Added complexity for no user-visible benefit over compile-time rewriting.

2. **Proxy-based module replacement** — Wrapping every mocked import in a `Proxy` would add runtime overhead and break `instanceof` checks. The compiler approach is zero-cost at runtime.

3. **Auto-mocking (vi.mock without factory)** — vitest supports `vi.mock('module')` without a factory, which auto-generates mocks for all exports. This requires loading the real module to discover its exports, then generating mocks. Out of scope for this design — we require an explicit factory.

---

## Non-Goals

- **Transitive mock propagation** — If test.ts mocks `'foo'`, and `bar.ts` imports `'foo'`, bar.ts gets the real module. Only direct imports in the file containing `vi.mock()` are intercepted. This matches 100% of current usage in the codebase.
- **Auto-mocking** — `vi.mock('module')` without a factory is not supported. An explicit factory is always required. Compile error if factory is missing.
- **Dynamic remocking within test bodies** — Calling `vi.mock()` or `mock.module()` inside `it()` / `beforeEach()` / `describe()` blocks is a compile error (not a warning). Mock registration is compile-time. Use `mockFn.mockImplementation()` to change behavior per test. See [Migration Path](#migration-path-for-non-top-level-mocks) below.
- **Mock factory re-evaluation per test** — The mock factory runs once per file during module evaluation. It is NOT re-invoked per `it()` block. Use `mockFn.mockImplementation()` or `mockFn.mockReturnValue()` to change behavior between tests. This is the same as vitest.
- **CommonJS module mocking** — All mocking assumes ESM. The codebase is 100% ESM.
- **`vi.unmock()` / `vi.restoreAllModuleMocks()`** — Not needed for current codebase patterns. If users adopt partial mocking via `vi.importActual()` + override, `vi.unmock()` may become needed. Revisit after adoption.

---

## Mock Isolation

Each test file runs in its own V8 runtime. Mock registrations are **file-scoped**.

- `vi.mock()` in file A has **zero effect** on file B. No cross-file leaking.
- This is a deliberate improvement over `bun:test`, which runs all files in one process where `vi.mock()` is permanent and global. The `build.test.ts` file explicitly documents this limitation: *"This test file avoids vi.mock() for shared modules because Bun test runs all files in one process and vi.mock() is permanent."*
- With `vtz test`, files like `build.test.ts` can now safely use `vi.mock()` without worrying about cross-file contamination.
- Mock state (call counts, return values) within a single file persists across `it()` blocks. Use `vi.clearAllMocks()` / `vi.resetAllMocks()` in `afterEach` to reset between tests.

---

## Migration Path for Non-Top-Level Mocks

Several existing test files use `mock.module()` inside `it()` or `beforeEach()` blocks combined with dynamic `import()`. This pattern works in `bun:test` (runtime mock interception) but **will not work** with compile-time rewriting. These files need refactoring.

### Pattern A: `mock.module()` inside `it()` + dynamic `import()`

**Before (bun:test pattern):**
```ts
it('test with driver A', async () => {
  mock.module('postgres', () => ({ default: mock(() => driverA) }));
  const { createDriver } = await import('../driver');
  // ...
});

it('test with driver B', async () => {
  mock.module('postgres', () => ({ default: mock(() => driverB) }));
  const { createDriver } = await import('../driver');
  // ...
});
```

**After (vtz pattern):**
```ts
const mockPostgresFactory = vi.fn();
vi.mock('postgres', () => ({ default: mockPostgresFactory }));

import { createDriver } from '../driver';

it('test with driver A', () => {
  mockPostgresFactory.mockReturnValue(driverA);
  // ... use createDriver directly
});

it('test with driver B', () => {
  mockPostgresFactory.mockReturnValue(driverB);
  // ... use createDriver directly
});
```

### Pattern B: `mock.module()` inside `beforeEach()`

**Before:**
```ts
beforeEach(() => {
  mock.module('@vertz/ui-server/ssr', () => ({
    createSSRHandler: mockCreateSSRHandler,
  }));
});
```

**After:**
```ts
vi.mock('@vertz/ui-server/ssr', () => ({
  createSSRHandler: mockCreateSSRHandler,
}));

beforeEach(() => {
  mockCreateSSRHandler.mockClear();
});
```

### Affected Files

| File | Pattern | Migration |
|------|---------|-----------|
| `packages/db/src/client/__tests__/database.test.ts` | A (5 calls inside `it()`) | Hoist mock, use `mockImplementation()` per test |
| `packages/db/src/client/__tests__/postgres-driver.test.ts` | A (3 calls inside `it()`) | Hoist mock, use `mockImplementation()` per test |
| `packages/cloudflare/tests/handler.test.ts` | B (1 call in `beforeEach()`) | Move to top level |
| `packages/cloudflare/tests/handler-isr.test.ts` | B (1 call in `beforeEach()`) | Move to top level |

---

## Unknowns

### Resolved

1. **Can ESM imports be rewritten to variable declarations without breaking semantics?**
   - Resolution: Yes. ESM `import` declarations are resolved during linking (before execution). Replacing them with `const` declarations in the transformed source means V8 never sees the import — it sees a variable declaration that executes during module evaluation. The variable is initialized from the mock factory, which runs at the top of the file. This is the same approach vitest uses.

2. **How do mock factories access `vi.fn()` and other test globals?**
   - Resolution: Test globals (`vi`, `mock`, `spyOn`, `expect`) are injected via the V8 snapshot, which runs before any module code. They're available as `globalThis.vi` etc. Mock factories execute during module evaluation, so globals are already available.

3. **What about `import * as ns from 'module'` syntax?**
   - Resolution: Transformed to `const ns = __vertz_mock_N`. The namespace object IS the factory result. Named property access (`ns.foo`) works on plain objects.

4. **Does mock hoisting interfere with signal transforms (`build_import_aliases`)?**
   - Resolution: Yes — `build_import_aliases()` registers imports as signal API sources before MagicString transforms run. If a test mocks `@vertz/ui`, the reactivity analyzer would incorrectly apply `.value` transforms to mock bindings. Solution: `collect_mocked_specifiers()` runs first and passes an exclusion set to `build_import_aliases()`.

5. **Does the compile cache handle mock hoisting correctly?**
   - Resolution: The cache key must include `mock_hoisting` in its hash. Currently `CompileCache::cache_key` hashes `source | CACHE_VERSION | target` — it must also hash all `CompileOptions` flags that affect output (including `skip_css_transform`, which has the same latent bug).

---

## Type Flow Map

No generics are introduced by this feature. The mock factory type is:

```
vi.mock(specifier: string, factory: () => Record<string, unknown>) → void
```

The factory return type is untyped (`Record<string, unknown>`) — matching vitest. Type safety comes from the test assertions, not the mock declaration.

`vi.hoisted<T>(factory: () => T) → T` preserves the generic from factory return to the destructured result.

`vi.importActual<T>(specifier: string) → Promise<T>` returns `Promise<T>` where T defaults to `Record<string, unknown>`.

---

## E2E Acceptance Test

From a developer's perspective, a test file with module mocking should work identically to vitest:

```ts
// file: src/__tests__/build-pipeline.test.ts
import { describe, it, expect, vi } from '@vertz/test';
import { createCompiler } from '@vertz/compiler';
import { buildProject } from '../build';

const { mockAnalyze } = vi.hoisted(() => ({
  mockAnalyze: vi.fn().mockResolvedValue({ modules: [] }),
}));

vi.mock('@vertz/compiler', () => ({
  createCompiler: vi.fn(() => ({
    analyze: mockAnalyze,
    compile: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

describe('buildProject', () => {
  it('calls compiler.analyze', async () => {
    await buildProject();
    expect(mockAnalyze).toHaveBeenCalled();
  });

  it('uses createCompiler from mock, not real module', () => {
    const compiler = createCompiler();
    expect(compiler.analyze).toBe(mockAnalyze);
  });
});
```

Running `vtz test src/__tests__/build-pipeline.test.ts` should:
- [x] Compile the test file with mock hoisting
- [x] `createCompiler` is the mock, not the real `@vertz/compiler` export
- [x] `mockAnalyze` (from `vi.hoisted()`) is accessible in the mock factory
- [x] Both tests pass
- [x] No real `@vertz/compiler` module is loaded

### Invalid usage — compile errors:

```ts
// Error: vi.mock() must be called at the module top level.
//   Move vi.mock() to the top of the file, and use mockFn.mockImplementation()
//   inside test blocks to change behavior per test.
function setup() {
  vi.mock('module', () => ({}));
}

// Error: vi.mock() requires a factory function.
//   Provide a factory: vi.mock('module', () => ({ ... }))
vi.mock('module');
```

---

## Design

### Architecture: Compile-Time Import Rewriting

The core insight is that **mock hoisting can be implemented entirely as a compiler transform** — no changes to the Rust module loader are needed. The compiler:

1. Scans for `vi.mock()` / `mock.module()` / `vi.hoisted()` calls at module top level
2. Collects which module specifiers are being mocked
3. Rewrites imports of those specifiers from ESM `import` declarations to `const` destructuring from the mock factory result
4. Hoists the mock registrations and `vi.hoisted()` calls above all other code
5. Transforms `vi.importActual('specifier')` to `import('specifier')` (dynamic import bypasses compile-time rewriting)

### Transform Example

**Input:**

```ts
import { describe, it, expect, vi } from '@vertz/test';
import { createCompiler } from '@vertz/compiler';
import { readFile } from 'node:fs/promises';

const { mockAnalyze } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
}));

vi.mock('@vertz/compiler', () => ({
  createCompiler: vi.fn(() => ({ analyze: mockAnalyze })),
}));

describe('test', () => {
  it('works', async () => {
    const actual = await vi.importActual('@vertz/compiler');
  });
});
```

**Output:**

```ts
import { describe, it, expect, vi } from '@vertz/test';
import { readFile } from 'node:fs/promises';

// — Hoisted: vi.hoisted() calls (before mock registrations)
const { mockAnalyze } = (() => ({
  mockAnalyze: vi.fn(),
}))();

// — Hoisted: mock factory invocation + registration
const __vertz_mock_0 = (() => ({
  createCompiler: vi.fn(() => ({ analyze: mockAnalyze })),
}))();
globalThis.__vertz_mocked_modules = globalThis.__vertz_mocked_modules || {};
globalThis.__vertz_mocked_modules['@vertz/compiler'] = __vertz_mock_0;

// — Rewritten import: ESM import → const destructuring from mock result
const { createCompiler } = __vertz_mock_0;

describe('test', () => {
  it('works', async () => {
    // vi.importActual → dynamic import (loads real module)
    const actual = await import('@vertz/compiler');
  });
});
```

### Key Transform Rules

| Pattern | Transform |
|---------|-----------|
| `import { a, b } from 'mocked'` | `const { a, b } = __vertz_mock_N` |
| `import def from 'mocked'` | `const def = "default" in __vertz_mock_N ? __vertz_mock_N.default : __vertz_mock_N` |
| `import def, { a } from 'mocked'` | `const def = "default" in __vertz_mock_N ? __vertz_mock_N.default : __vertz_mock_N; const { a } = __vertz_mock_N;` |
| `import * as ns from 'mocked'` | `const ns = __vertz_mock_N` |
| `import 'mocked'` (side-effect) | Removed entirely |
| `vi.hoisted(() => expr)` | `(() => expr)()` — moved to top via `ms.prepend_left(0, ...)` |
| `vi.mock('spec', factory)` | `const __vertz_mock_N = (factory)(); globalThis.__vertz_mocked_modules[...] = ...` — moved to top via `ms.prepend_left(0, ...)` |
| `mock.module('spec', factory)` | Same as `vi.mock` |
| `vi.importActual('spec')` | `import('spec')` — overwrite in place via `ms.overwrite(start, end, ...)` |
| `vi.mock()` inside function body | Compile **error** (not warning) with actionable fix suggestion |
| `vi.mock('spec')` without factory | Compile **error**: factory required |
| `vi.mock('spec', factory)` with no matching import | Compile **warning**: unused mock |

> **Default import semantics:** The `"default" in` check is used instead of `??` (nullish coalescing) because `null` is a valid default export value. `??` would incorrectly fall through to the entire mock object when the factory returns `{ default: null }`.

### Output Ordering

The transformed output follows this strict order:

1. **Non-mocked imports** — remain as ESM `import` declarations (unchanged)
2. **`vi.hoisted()` results** — IIFE invocations (prepended at position 0)
3. **Mock factory invocations** — `const __vertz_mock_N = (factory)()` (prepended at position 0, after hoisted)
4. **`globalThis.__vertz_mocked_modules` registrations** — for runtime access
5. **Rewritten import bindings** — `const { ... } = __vertz_mock_N` (overwrite original import span)
6. **Remaining module body** — everything else, minus the original `vi.mock()`/`vi.hoisted()` calls (overwritten to empty)

Non-mocked ESM imports are resolved during V8 module linking (before evaluation), so they're available before step 2. This means mock factories can't depend on non-mocked imports — matching vitest behavior.

### MagicString Operations

| Operation | MagicString method | Purpose |
|-----------|-------------------|---------|
| Insert hoisted code at top | `prepend_left(0, ...)` | `vi.hoisted()` IIFEs and mock factory IIFEs |
| Rewrite mocked imports | `overwrite(import_start, import_end, ...)` | Replace ESM import with `const` destructuring |
| Remove `vi.mock()` calls | `overwrite(stmt_start, stmt_end, "")` | Remove original mock call from body |
| Remove `vi.hoisted()` calls | `overwrite(stmt_start, stmt_end, "")` | Remove original hoisted call from body |
| Rewrite `vi.importActual()` | `overwrite(call_start, call_end, "import(...)") ` | Replace with dynamic import |

### Pipeline Placement

Mock hoisting runs **before TypeScript stripping** in the compile pipeline. This ensures:

1. The transform sees the original AST with all import declarations intact
2. `import type` declarations are still present but ignored (mock hoisting only processes value imports)
3. After mock hoisting rewrites mocked imports (overwrite to `const`), TypeScript stripping processes the remaining type-only imports without conflicting MagicString edits

The order:
1. **Mock hoisting** (new) — rewrites mocked imports, hoists factories
2. TypeScript stripping — removes type annotations, `import type`, `as` casts
3. Route splitting, field selection, etc.
4. Per-component transforms (signal, computed, JSX)

### Signal API Exclusion

`build_import_aliases()` in the reactivity analyzer walks all `ImportDeclaration` nodes to build the signal API alias map. If a test mocks `@vertz/ui` (which exports `query`, `form`, etc.), the analyzer would incorrectly apply `.value` transforms to mock bindings.

Solution: Before `build_import_aliases()`, call `collect_mocked_specifiers(program) -> HashSet<String>` from `mock_hoisting.rs`. Pass this as an exclusion set. Any import from a mocked specifier is excluded from signal API analysis.

### Nested Mock Detection Strategy

To detect `vi.mock()` / `mock.module()` inside function bodies (which should be a compile error):

1. **Top-level collection:** Iterate `program.body` directly (same pattern as `context_stable_ids.rs`). Top-level `ExpressionStatement` nodes with `vi.mock()` / `mock.module()` calls are valid — collect them.
2. **Nested detection:** Do a separate `Visit` walk that matches `vi.mock()` / `mock.module()` calls NOT found in step 1 (i.e., inside function bodies, arrow functions, class methods). Emit compile error for each.

This two-pass approach avoids accidentally hoisting mocks from inside `beforeEach()` or `it()` blocks.

### Where the Transform Runs

| Component | File | Change |
|-----------|------|--------|
| **Compiler core** | `native/vertz-compiler-core/src/mock_hoisting.rs` (new) | AST analysis + MagicString transform |
| **Compiler pipeline** | `native/vertz-compiler-core/src/lib.rs` | Add `mock_hoisting` to `CompileOptions`, call transform before TS stripping, pass exclusion set to `build_import_aliases` |
| **Compile cache** | `native/vtz/src/runtime/compile_cache.rs` | Include all `CompileOptions` flags in cache key hash (not just source+target) |
| **Vertz plugin** | `native/vtz/src/plugin/vertz.rs` | Pass `mock_hoisting: true` for test files (same pattern as `skip_css_transform`) |
| **Test harness** | `native/vtz/src/test/globals.rs` | Add `vi.hoisted()` and `vi.importActual()` runtime stubs, update `vi.mock()` to store result not factory |

### Why Compiler-Only (No Module Loader Changes)

1. **ESM exports are static** — `ModuleLoader::load()` must return source with static `export` declarations. Generating these from a dynamic factory would require pre-analyzing the original module's exports.
2. **Simpler** — A single AST pass in the compiler handles everything. No shared state between JS and Rust, no two-phase loading, no synthetic modules.
3. **Zero runtime cost** — The transform happens once at compile time. At runtime, mock factories execute as IIFEs — identical performance to hand-written code.
4. **Matches all codebase patterns** — 100% of existing `vi.mock()` / `mock.module()` calls are for direct imports in the same file. No transitive mocking is needed.

### Runtime Changes (Minimal)

The test harness (`globals.rs`) needs:

1. **`vi.hoisted(factory)`** — calls factory immediately and returns the result. At runtime, `vi.hoisted()` is just `factory()`. The compiler handles the hoisting (moving the call to the top of the file).

2. **`vi.importActual(specifier)`** — the compiler transforms this to `import(specifier)`, so no runtime implementation is needed. But we add a runtime stub that calls `import()` as a fallback for uncompiled code.

3. **`vi.mock()` updated** — the runtime stub now stores the factory **result** (not the factory function) on `globalThis.__vertz_mocked_modules`, matching the compiler's behavior:
   ```js
   mock: (modulePath, factory) => {
     if (!globalThis.__vertz_mocked_modules) globalThis.__vertz_mocked_modules = {};
     globalThis.__vertz_mocked_modules[modulePath] = typeof factory === 'function' ? factory() : factory;
   },
   ```

### Known Limitations

- **Source maps do not reflect mock hoisting transforms.** Stack traces in test files may point to incorrect line numbers for hoisted code. This is a general limitation of the MagicString + OXC codegen approach (pre-existing for all transforms, not introduced by this feature). The impact is small since mock hoisting only affects test files.

---

## Phases

### Phase 1: Compiler Transform — Mock Detection & Import Rewriting

**Scope:** New `mock_hoisting.rs` in vertz-compiler-core. Detects `vi.mock()`, `mock.module()`, `vi.hoisted()`, and `vi.importActual()` at module level. Rewrites imports. Hoists declarations.

**Acceptance criteria:**
- `vi.mock('specifier', factory)` is hoisted above all other code
- `mock.module('specifier', factory)` is treated identically
- `import { name } from 'mocked-specifier'` is rewritten to `const { name } = __vertz_mock_N`
- `import def from 'mocked'` is rewritten to `const def = "default" in __vertz_mock_N ? __vertz_mock_N.default : __vertz_mock_N`
- `import * as ns from 'mocked'` is rewritten to `const ns = __vertz_mock_N`
- `import 'mocked'` (side-effect only) is removed
- Non-mocked imports are left untouched
- `vi.hoisted(() => expr)` is hoisted above mock registrations
- `vi.importActual('spec')` is replaced with `import('spec')`
- `vi.mock()` inside function bodies emits a compile **error** with actionable fix message
- `vi.mock('spec')` without factory emits a compile **error**
- `vi.mock('spec', factory)` with no matching import emits a compile **warning** (unused mock)
- Transform is a no-op when no mock calls exist (zero overhead for non-mocking files)
- `collect_mocked_specifiers()` provides exclusion set for `build_import_aliases()`

### Phase 2: Runtime Stubs + Pipeline Integration

**Scope:** Add `vi.hoisted()` and `vi.importActual()` to the test harness. Wire `mock_hoisting: true` in the VertzPlugin for test files. Add `CompileOptions.mock_hoisting` flag. Fix compile cache key.

**Acceptance criteria:**
- `vi.hoisted(fn)` returns `fn()` at runtime
- `vi.importActual(spec)` returns `import(spec)` at runtime
- `vi.mock(path, factory)` stores `factory()` result (not factory function) on `globalThis.__vertz_mocked_modules`
- `VertzPlugin::compile()` passes `mock_hoisting: true` for test files
- `CompileOptions { mock_hoisting: Some(true) }` enables the transform
- `CompileCache::cache_key` includes all `CompileOptions` flags in hash (fixes latent bug for `skip_css_transform` too)

### Phase 3: End-to-End Integration Tests

**Scope:** Integration tests that run real test files through `vtz test` with module mocking.

**Acceptance criteria:**
- Test file with `vi.mock()` + named imports works end-to-end
- Test file with `mock.module()` + default import works end-to-end
- Test file with `vi.hoisted()` + factory reference works end-to-end
- Test file with `vi.importActual()` loads real module
- Test file with mixed mocked and non-mocked imports works
- Test file without any mocks compiles identically to before (regression)
- Mocked modules are reset between test files (per-file isolation via fresh V8 runtime)

### Phase 4: Migrate Existing Tests

**Scope:** Refactor existing test files that use non-top-level `mock.module()` / `vi.mock()` calls, then verify all 15 module-mocking test files pass under `vtz test`.

**Sub-tasks:**

**4a: Refactor `mock.module()` inside `it()` blocks**
- `packages/db/src/client/__tests__/database.test.ts` (5 calls) — hoist mock to top level, use `mockImplementation()` per test
- `packages/db/src/client/__tests__/postgres-driver.test.ts` (3 calls) — hoist mock to top level, use `mockImplementation()` per test

**4b: Refactor `mock.module()` inside `beforeEach()` blocks**
- `packages/cloudflare/tests/handler.test.ts` (1 call) — move to top level, keep `mockClear()` in `beforeEach()`
- `packages/cloudflare/tests/handler-isr.test.ts` (1 call) — move to top level, keep `mockClear()` in `beforeEach()`

**4c: Verify all module-mocking files pass**
- All 15 files with top-level `vi.mock()` / `mock.module()` pass under `vtz test`
- Full `vtz test` run shows no regressions in non-mocking test files
- No `mock.module()` or `vi.mock()` calls remain inside function bodies

**Affected files (complete list):**
- `packages/cli/src/pipeline/__tests__/orchestrator.test.ts`
- `packages/cli/src/production-build/__tests__/orchestrator.test.ts`
- `packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts`
- `packages/cli/src/__tests__/db.test.ts`
- `packages/cli/src/__tests__/db-pull.test.ts`
- `packages/cli/src/commands/__tests__/start.test.ts`
- `packages/cli/src/commands/__tests__/docs.test.ts`
- `packages/db/src/client/__tests__/database.test.ts` (needs refactor — Pattern A)
- `packages/db/src/client/__tests__/postgres-driver.test.ts` (needs refactor — Pattern A)
- `packages/ui-primitives/src/utils/__tests__/floating.test.ts`
- `packages/cloudflare/tests/handler.test.ts` (needs refactor — Pattern B)
- `packages/cloudflare/tests/handler-isr.test.ts` (needs refactor — Pattern B)
- `packages/create-vertz-app/src/__tests__/create-vertz-app.test.ts`
- `packages/cli/src/__tests__/load-introspect-context.test.ts`
- `packages/cli/src/commands/__tests__/build.test.ts` (currently avoids `vi.mock()` due to bun:test global leaking — can now use `vi.mock()` safely)
