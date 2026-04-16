# Phase 1: Bridge Preload Mocks to Rust Registry

## Context

Bug fix for #2667. Preload scripts that call `mock.module()` populate `globalThis.__vertz_mocked_modules` at runtime, but the Rust module loader only checks its `mocked_paths` HashMap for mock interception. This phase adds a bridge: after each preload loads, query the JS global for new mock specifiers and register them in the Rust registry.

Design doc: `plans/2667-preload-mock-registration.md`

## Tasks

### Task 1: Add Rust test for preload mock registration

**Files:**
- `native/vtz/src/test/executor.rs` (modified — add test)

**What to implement:**
Add a test that creates a preload script which calls `mock.module('some-specifier', factory)`, runs a test file that imports the mocked specifier, and verifies the mock is received instead of the real module.

This test should fail (RED) because preload mocks are not yet registered in the module loader.

**Acceptance criteria:**
- [ ] Test exists and fails with the expected error (module not found or real module loaded instead of mock)

---

### Task 2: Bridge preload mocks in executor.rs

**Files:**
- `native/vtz/src/test/executor.rs` (modified — preload loop)

**What to implement:**
After each preload script loads via `load_side_module()`, execute a JS snippet to read `Object.keys(globalThis.__vertz_mocked_modules || {})`. Diff against previously known keys. Register new specifiers via `register_mocked_specifiers()` using the preload file path as the referrer.

```rust
let mut known_mock_keys: HashSet<String> = HashSet::new();

for preload_path in &options.preload {
    // ... existing load_side_module code ...

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

**Acceptance criteria:**
- [ ] Task 1's test now passes (GREEN)
- [ ] Existing tests still pass (`cargo test --all`)
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean

---

### Task 3: Verify affected ui-server tests

**Files:**
- No code changes — validation only

**What to implement:**
Run the 4 affected `@vertz/ui-server` test files and verify they no longer fail with `Cannot find module '@vertz/ui-auth'`.

**Acceptance criteria:**
- [ ] `vtz test packages/ui-server/src/__tests__/node-handler.test.ts` passes
- [ ] `vtz test packages/ui-server/src/__tests__/ssr-handler.test.ts` passes
- [ ] `vtz test packages/ui-server/src/__tests__/ssr-render.test.ts` passes
- [ ] `vtz test packages/ui-server/src/__tests__/ssr-single-pass.test.ts` passes
