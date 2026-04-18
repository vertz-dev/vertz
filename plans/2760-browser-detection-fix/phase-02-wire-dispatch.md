# Phase 2: Wire install/uninstall into SSR dispatch + fix fetch interceptor

## Context

Phase 1 defined `globalThis.__vertz_install_dom_shim()` and `__vertz_uninstall_dom_shim()` but still eagerly installs the DOM shim at snapshot time to preserve current behavior. This phase removes the eager install, wires install/uninstall around the two JS dispatch points in `native/vtz/src/runtime/persistent_isolate.rs`, and fixes the fetch interceptor so it no longer depends on `location` being installed at startup.

**Design reference:** `plans/2760-browser-detection-fix.md`, sections "Where install/uninstall is called (correct hook location)" and "Fetch interceptor dependency on `location`".

**Key design points:**
- The two dispatch functions — `dispatch_ssr_request` (line 1358) and `dispatch_component_render` (line 1670) — must call `__vertz_install_dom_shim()` **before** the first JS execution and `__vertz_uninstall_dom_shim()` **after** the event loop returns, including on error and timeout paths.
- Use `scopeguard::defer!` (already a runtime dependency, verify in `native/vtz/Cargo.toml`) for cleanup that runs on every return path. If not present, add it or use manual `let _guard = ...` with a Drop impl.
- The fetch interceptor in `native/vtz/src/runtime/js_runtime.rs` (around line 1137) reads `globalThis.location.origin` at install time. Change to read `globalThis.location?.origin ?? null` lazily inside the fetch hook so it works whether `location` is installed or not.

At end of Phase 2, the production snapshot no longer has `window`/`document`/etc. installed eagerly. Running `typeof window` in a fresh runtime returns `"undefined"`. SSR renders continue to work because install is called inside dispatch. Server handlers see the clean env.

## Tasks

### Task 2.1: Write Rust tests proving handler context sees no browser globals (RED)

**Files:** (1)
- `native/vtz/src/runtime/__tests__/clean_handler_env_test.rs` (new — if the `__tests__` directory doesn't exist, create it and register via `#[cfg(test)] mod __tests__;` in `mod.rs` per existing Rust test conventions in this crate)

**What to implement:**

Write failing tests that simulate a handler-like context: a fresh production runtime with no prior SSR render.

```rust
#[tokio::test]
async fn test_fresh_runtime_has_no_window() {
    let mut rt = VertzJsRuntime::new_for_production(VertzRuntimeOptions::default()).unwrap();
    let result = rt.execute_script("<t>", "typeof window").unwrap();
    assert_eq!(result.to_rust_string(), "undefined");
}

#[tokio::test]
async fn test_fresh_runtime_has_no_document() {
    // typeof document === 'undefined'
}

#[tokio::test]
async fn test_fresh_runtime_has_no_html_element() {
    // typeof HTMLElement === 'undefined'
}

#[tokio::test]
async fn test_fresh_runtime_has_navigator() {
    // typeof navigator === 'object' && navigator.userAgent contains 'vertz-server'
}

#[tokio::test]
async fn test_css_collector_exists_without_install() {
    // typeof globalThis.__vertz_inject_css === 'function'
    // __vertz_get_collected_css() returns []
}
```

These fail after Phase 1 because the eager install at the end of the permanent block still runs at snapshot time.

**Acceptance criteria:**
- [ ] Tests compile
- [ ] Tests fail with the message "typeof window is 'object', expected 'undefined'" (or similar) — proving the eager install is still active after Phase 1

---

### Task 2.2: Remove eager install, keep install/uninstall registration (GREEN for 2.1)

**Files:** (1)
- `native/vtz/src/ssr/dom_shim.rs` (modified — remove the final `globalThis.__vertz_install_dom_shim();` call from the permanent block; keep the function registrations)

**What to implement:**

Delete the single line at the end of `DOM_SHIM_JS` that calls `__vertz_install_dom_shim()`. The install/uninstall functions remain registered; they're just not invoked at snapshot time anymore.

**Acceptance criteria:**
- [ ] All Task 2.1 tests pass
- [ ] Task 1.1 tests still pass (install/uninstall functions still registered)
- [ ] SSR tests in `native/vtz/src/ssr/` fail OR pass depending on whether they explicitly call install — this is expected; Task 2.3 re-greens them
- [ ] `cargo test --all` is NOT fully green yet — existing SSR tests that rely on eager install fail. This is expected and fixed in Task 2.3.

---

### Task 2.3: Wire install/uninstall into `dispatch_ssr_request` and `dispatch_component_render`

**Files:** (2)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified — wrap dispatch bodies)
- `native/vtz/Cargo.toml` (modified only if `scopeguard` isn't already a dependency)

**What to implement:**

In `dispatch_ssr_request` (around line 1358) and `dispatch_component_render` (around line 1670), add:

```rust
// Install DOM shim for this render. Uninstall on every return path.
runtime.execute_script_void("<dom-install>", "globalThis.__vertz_install_dom_shim();")
    .map_err(|e| format!("DOM shim install error: {}", e))?;

// Use a guard so uninstall runs even on error/timeout.
let uninstall = scopeguard::guard(&mut *runtime, |rt| {
    // Best-effort; ignore errors during teardown.
    let _ = rt.execute_script_void("<dom-uninstall>", "globalThis.__vertz_uninstall_dom_shim();");
});
// … existing dispatch body uses `uninstall` as the runtime reference …
```

OR, if `scopeguard` isn't desired, manual pattern:

```rust
async fn dispatch_ssr_request(runtime: &mut VertzJsRuntime, request: &SsrRequest) -> Result<SsrResponse, String> {
    runtime.execute_script_void("<dom-install>", "globalThis.__vertz_install_dom_shim();")
        .map_err(|e| format!("DOM shim install: {}", e))?;

    let result = dispatch_ssr_request_inner(runtime, request).await;

    let _ = runtime.execute_script_void("<dom-uninstall>", "globalThis.__vertz_uninstall_dom_shim();");
    result
}
```

The inner function contains today's body. This pattern works with existing `?` early returns without needing `scopeguard`.

**Acceptance criteria:**
- [ ] `dispatch_ssr_request` calls install before first JS exec and uninstall before returning (all paths)
- [ ] `dispatch_component_render` same
- [ ] All existing `persistent_isolate.rs` tests pass
- [ ] Task 1.1 and Task 2.1 tests still pass
- [ ] Add a new test: `test_ssr_render_leaves_no_browser_globals` — runs a real minimal SSR, asserts `typeof window` is undefined after

---

### Task 2.4: Fix fetch interceptor to read `location` lazily

**Files:** (1)
- `native/vtz/src/runtime/js_runtime.rs` (modified — inside `FETCH_INTERCEPTOR_JS` string, change eager `selfOrigin` capture to lazy-per-call)

**What to implement:**

Locate the line in `FETCH_INTERCEPTOR_JS` that currently reads:

```js
const selfOrigin = typeof globalThis.location !== 'undefined' ? globalThis.location.origin : '';
```

Change it to be read inside the fetch wrapper:

```js
function __vertz_self_origin() {
  return typeof globalThis.location !== 'undefined' && globalThis.location
    ? globalThis.location.origin
    : null;
}
// then inside the interceptor:
const selfOrigin = __vertz_self_origin();
// … use selfOrigin as before, treating null the same as '' for the same-origin check.
```

Add a test to `js_runtime.rs::tests` (or a new `fetch_interceptor_lazy_location_test.rs`):

```rust
#[test]
fn test_fetch_interceptor_works_with_no_location() {
    // Fresh production runtime (no location installed).
    // Invoke fetch to a known URL. Assert the interceptor does not throw
    // and routes to the handler path (no self-origin short-circuit).
}

#[test]
fn test_fetch_interceptor_reads_location_when_installed() {
    // Install DOM shim → location defined with origin 'http://localhost'.
    // Invoke fetch to 'http://localhost/api/foo' → should be classified as same-origin.
}
```

**Acceptance criteria:**
- [ ] Fetch interceptor no longer reads `globalThis.location` at install time (only inside the wrapped fetch call)
- [ ] New tests pass
- [ ] Pre-existing fetch interceptor tests still pass

---

### Task 2.5: Ensure test snapshot and tests call install where they expect DOM globals

**Files:** (1)
- `native/vtz/src/ssr/dom_shim.rs` (modified — update the `tests` module; existing tests like `test_window_is_defined` must now call `__vertz_install_dom_shim()` before asserting `window` is defined)

**What to implement:**

Scan `native/vtz/src/ssr/dom_shim.rs::tests` and any `native/vtz/src/ssr/*_test.rs` files. Tests that expect `window`, `document`, or DOM constructors to exist must call:

```rust
rt.execute_script_void("<install>", "globalThis.__vertz_install_dom_shim();").unwrap();
```

before their assertion. Do NOT delete tests — migrate them. Tests that assert the absence of globals (from Task 2.1) stay as-is.

**Acceptance criteria:**
- [ ] `cargo test --all` fully green
- [ ] `cargo clippy --all-targets -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean

---

## Quality Gates

Before merging Phase 2:
- `cargo test --all` green
- `cargo clippy --all-targets -- -D warnings` clean
- `cargo fmt --all -- --check` clean
- `vtz test` green (TS tests unaffected; we haven't touched TypeScript yet)
- `vtz run typecheck` clean
- `vtz run lint` clean
- `bash scripts/audit-window-document-refs.sh` clean

## Adversarial Review

After Phase 2 green, review must verify:
- Every early-return path in `dispatch_ssr_request` and `dispatch_component_render` is covered by the uninstall (test with a deliberately-thrown error in render code)
- Timeout path (the `EVENT_LOOP_TIMEOUT` tokio::time::timeout) also runs uninstall — important for not leaking state across subsequent renders
- Fetch interceptor change does not break same-origin detection for CSS/asset URLs served by the dev server
- `__vertz_install_dom_shim()` called from inside a render that awaits a long-running operation still correctly holds `window` defined for the entire render (serialization at the message level, not the promise level)

Write review to `reviews/2760-browser-detection-fix/phase-02-wire-dispatch.md`.
