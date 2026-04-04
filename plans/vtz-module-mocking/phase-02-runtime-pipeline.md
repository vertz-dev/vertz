# Phase 2: Runtime Stubs + Pipeline Integration

## Context

Phase 1 implements the compiler transform for mock hoisting and import rewriting. This phase wires it into the vtz runtime: adds `vi.hoisted()` and `vi.importActual()` to the test harness, configures the VertzPlugin to pass `mock_hoisting: true` for test files, and fixes the compile cache to include option flags in its key.

Design doc: `plans/vtz-module-mocking.md`

## Tasks

### Task 1: Add `vi.hoisted()` and `vi.importActual()` to test harness

**Files:**
- `native/vtz/src/test/globals.rs` (modify)

**What to implement:**

In the `vi` object definition (around line 929), add two new methods:

1. **`vi.hoisted(factory)`** — calls factory immediately, returns result:
   ```js
   hoisted: (factory) => {
     return typeof factory === 'function' ? factory() : factory;
   },
   ```

2. **`vi.importActual(specifier)`** — returns dynamic import (the compiler transforms this to `import()`, but the runtime stub exists as a fallback):
   ```js
   importActual: (specifier) => {
     return import(specifier);
   },
   ```

3. **Update `vi.mock()`** — store factory result instead of factory function:
   ```js
   mock: (modulePath, factory) => {
     if (!globalThis.__vertz_mocked_modules) globalThis.__vertz_mocked_modules = {};
     globalThis.__vertz_mocked_modules[modulePath] = typeof factory === 'function' ? factory() : factory;
   },
   ```

4. **Update `mock.module()`** — delegates to `vi.mock()` (no change needed, already does this).

5. **Add `vi.hoisted` and `vi.importActual` to `__vertz_test_exports`** (around line 1004):
   ```js
   globalThis.__vertz_test_exports = {
     describe, it, test, expect,
     beforeEach, afterEach, beforeAll, afterAll,
     mock, spyOn, vi, expectTypeOf,
   };
   ```
   (No change needed here since `vi` is already exported and the new methods are on the `vi` object.)

**Acceptance criteria:**
- [x] `vi.hoisted(() => ({ x: 1 }))` returns `{ x: 1 }`
- [x] `vi.importActual('specifier')` returns a Promise (dynamic import)
- [x] `vi.mock('path', factory)` stores `factory()` result on `__vertz_mocked_modules`
- [x] Existing `vi.fn()`, `vi.spyOn()`, timer mocking still works (no regression)
- [x] `__vertz_test_exports.vi` includes new methods

---

### Task 2: Wire `mock_hoisting: true` in VertzPlugin for test files

**Files:**
- `native/vtz/src/plugin/vertz.rs` (modify)

**What to implement:**

In `VertzPlugin::compile()`, pass `mock_hoisting: true` when compiling test files. Follow the existing pattern used for `skip_css_transform`:

```rust
fn compile(&self, source: &str, ctx: &CompileContext) -> CompileOutput {
    let filename = ctx.file_path.to_string_lossy().to_string();
    let is_test = crate::test::is_test_file(ctx.file_path);

    let compile_result = vertz_compiler_core::compile(
        source,
        vertz_compiler_core::CompileOptions {
            filename: Some(filename.clone()),
            target: Some(ctx.target.to_string()),
            fast_refresh: Some(true),
            skip_css_transform: Some(is_test),
            mock_hoisting: Some(is_test),  // NEW
            ..Default::default()
        },
    );
    // ... rest unchanged
}
```

**Acceptance criteria:**
- [x] Test files (`.test.ts`, `.test.tsx`, `.spec.ts`, `__tests__/*.ts`) are compiled with `mock_hoisting: true`
- [x] Non-test files are compiled with `mock_hoisting: false` (or `None`)
- [x] Existing test file compilation still works (CSS skip, etc.)

---

### Task 3: Fix compile cache key to include option flags

**Files:**
- `native/vtz/src/runtime/compile_cache.rs` (modify)

**What to implement:**

The current `cache_key()` method hashes `source | CACHE_VERSION | target`. It does NOT include `CompileOptions` flags like `skip_css_transform` or `mock_hoisting`, which means the same source compiled with different options could return a wrong cached result.

Update the cache key computation to include all boolean `CompileOptions` flags. The cache key is computed in the module loader's `compile_source()` method which calls `self.compile_cache.get(source, target)`.

Two approaches (pick the simpler one):
1. Add an `options_hash` parameter to `CompileCache::get()` and `CompileCache::set()` that includes the relevant flags
2. Encode flags into the `target` string (e.g., `"ssr"` vs `"ssr+mock"`)

The cleanest approach: extend the cache key to accept additional discriminants:

```rust
pub fn get(&self, source: &str, target: &str, options_hash: &str) -> Option<CachedCompilation> {
    // ... key = SHA256(source | CACHE_VERSION | target | options_hash)
}
```

In `module_loader.rs`, compute `options_hash` from the compile options:
```rust
let options_hash = format!(
    "css:{},mock:{}",
    skip_css as u8,
    mock_hoisting as u8,
);
```

**Acceptance criteria:**
- [x] Same source compiled with `mock_hoisting: true` and `mock_hoisting: false` produces different cache keys
- [x] Same source compiled with `skip_css_transform: true` and `false` produces different cache keys
- [x] Cache hits still work correctly for identical options
- [x] Existing cache tests pass (no regression)

---

### Task 4: Test the full pipeline (compiler + runtime + plugin)

**Files:**
- `native/vtz/src/test/globals.rs` tests (extend existing `#[cfg(test)]` module)
- `native/vtz/src/plugin/vertz.rs` tests (extend existing `#[cfg(test)]` module)

**What to implement:**

Add integration-level tests in the Rust test modules:

1. **Harness test:** Execute test harness JS + a mock-using script via `create_test_runtime()`:
   ```js
   vi.hoisted(() => ({ x: 42 }));
   // Verify it returns the result
   ```

2. **Plugin test:** Compile a test file through `VertzPlugin::compile()` and verify the output contains:
   - `__vertz_mock_0` variable declaration
   - `globalThis.__vertz_mocked_modules` registration
   - `const { ... } = __vertz_mock_0` destructuring
   - No original `vi.mock()` call

3. **Cache key test:** Verify that `compile_cache.get()` with different option flags returns `None` (cache miss).

**Acceptance criteria:**
- [x] `vi.hoisted()` returns factory result in V8 runtime
- [x] `vi.mock()` stores factory result (not function) on `__vertz_mocked_modules`
- [x] VertzPlugin compiles test file with mock hoisting enabled
- [x] Cache returns different entries for different option flags
