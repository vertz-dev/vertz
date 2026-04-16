# fix(vtz): Preload Script Mock Registration (#2667)

## Description

The vtz test runner's mock system only registers mocks extracted at **compile time** from the test file itself (`register_mocked_specifiers`). Mocks registered by preload scripts at runtime (via `mock.module()` / `vi.mock()`) populate `globalThis.__vertz_mocked_modules` but are never registered in the Rust module loader's `mocked_paths` HashMap. This means the module loader never intercepts imports of preload-mocked modules.

### Root Cause

The mock system has two disjoint paths:

1. **Compile-time (test file only):** `compile_for_mock_extraction()` scans the test file AST for top-level `vi.mock()` / `mock.module()` calls, extracts specifiers, and registers them via `register_mocked_specifiers()` in Rust's `mocked_paths`.
2. **Runtime (preload scripts):** `mock.module()` stores the mock implementation in `globalThis.__vertz_mocked_modules[specifier]`, but nothing registers the specifier in `mocked_paths`.

The module loader (in `resolve()`) only checks `mocked_paths` to decide whether to redirect an import to a mock proxy. Since preload mocks never enter `mocked_paths`, they are silently ignored.

Compile-time extraction cannot solve this because preload mocks are **conditional** (inside `if` blocks), and the mock hoisting transform only processes top-level statements.

### Affected Tests

4 files in `@vertz/ui-server` rely on `preload-mock-native-compiler.ts` to mock `@vertz/ui-auth`:
- `packages/ui-server/src/__tests__/node-handler.test.ts`
- `packages/ui-server/src/__tests__/ssr-handler.test.ts`
- `packages/ui-server/src/__tests__/ssr-render.test.ts`
- `packages/ui-server/src/__tests__/ssr-single-pass.test.ts`

## Fix

After loading each preload script, query `globalThis.__vertz_mocked_modules` for newly added keys and register them in `mocked_paths` via `register_mocked_specifiers()`, using the preload file path as the referrer for resolution.

### Implementation

In `native/vtz/src/test/executor.rs`, modify the preload loading loop (step 4):

```rust
// 4. Load preload scripts as ES modules (supports import statements)
let mut known_mock_keys: HashSet<String> = HashSet::new();

for preload_path in &options.preload {
    let specifier = ModuleSpecifier::from_file_path(preload_path).map_err(|_| {
        deno_core::anyhow::anyhow!("Invalid preload path: {}", preload_path.display())
    })?;
    tokio_rt.block_on(async { runtime.load_side_module(&specifier).await })?;

    // Register any mocks declared by this preload script.
    // Preload mocks populate globalThis.__vertz_mocked_modules at runtime,
    // but the module loader only checks the Rust-side mocked_paths registry.
    // Bridge the gap by reading new keys and registering them.
    let current_keys = runtime.execute_script(
        "[vertz:preload-mock-keys]",
        "Object.keys(globalThis.__vertz_mocked_modules || {})",
    )?;

    if let serde_json::Value::Array(arr) = current_keys {
        let new_specifiers: HashSet<String> = arr
            .into_iter()
            .filter_map(|v| v.as_str().map(String::from))
            .filter(|k| !known_mock_keys.contains(k))
            .collect();

        if !new_specifiers.is_empty() {
            for s in &new_specifiers {
                known_mock_keys.insert(s.clone());
            }
            runtime
                .loader()
                .register_mocked_specifiers(&new_specifiers, preload_path);
        }
    }
}
```

### Why this approach

1. **Reuses existing infrastructure** — `register_mocked_specifiers()` already handles specifier resolution and canonicalization.
2. **Handles relative paths correctly** — Each preload's mocks are resolved relative to that preload's file path, not the test file.
3. **Handles conditional mocks** — Queries the runtime state after evaluation, so `if (!available) { mock.module(...) }` patterns work.
4. **No JS API changes** — `mock.module()` behavior is unchanged; the fix is purely in the Rust executor.
5. **Handles multiple preloads** — The diff-based approach (`known_mock_keys`) correctly attributes mocks to their originating preload.

## Manifesto Alignment

- **Principle 4 (Test what matters):** Preload scripts are a standard testing pattern for shared setup. Mocks declared there should work identically to mocks in test files.
- **Principle 5 (If you can't test it, don't build it):** The SSR tests need to mock `@vertz/ui-auth` (circular workspace dep). Without this fix, those tests can't run.

## Non-Goals

- **Transitive mock propagation** — This fix does not change the existing non-goal: if `test.ts` mocks `'foo'` and `bar.ts` imports `'foo'`, `bar.ts` still gets the real module. This fix only ensures that mock registrations in preload scripts reach the module loader.
- **Compile-time preload mock extraction** — Not needed; runtime query is simpler and handles conditional mocks.
- **Changes to the `mock.module()` JS API** — No API changes required.

## Unknowns

None identified. The fix is a well-understood bridge between existing systems.

## Type Flow Map

N/A — This is a Rust-only change with no TypeScript type changes.

## E2E Acceptance Test

```
Given a preload script that conditionally calls mock.module('@vertz/ui-auth', factory)
When a test file imports '@vertz/ui-auth'
Then the import resolves to the mock, not the real module

Given a preload script that calls mock.module('../relative/path', factory)
When a test file's transitive import resolves to the same canonical path
Then the import resolves to the mock

Given multiple preload scripts each registering different mocks
When test files import the mocked modules
Then each mock resolves correctly
```

Concrete validation: All 4 affected `@vertz/ui-server` SSR test files pass without `Cannot find module '@vertz/ui-auth'` errors.
