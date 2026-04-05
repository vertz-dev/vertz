# Phase 1: Runtime Built-in Module Stubs

- **Author:** viniciusdacal
- **Reviewer:** claude-opus-4.6 (adversarial)
- **Commits:** e99ca6ef5
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/server/module_server.rs` (modified) — added `is_runtime_builtin()` + `runtime_builtin_stub()` helpers and early return in `handle_deps_request()`
- `native/vtz/src/compiler/import_rewriter.rs` (modified) — added early return for `node:`/`bun:` prefixes in `rewrite_specifier_inner()`

## CI Status

- [x] Quality gates passed (`cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check`)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc (N/A — internal fix)

## Findings

### BLOCKER #1 — Stub only exports `default`, named imports silently `undefined`
**Status: RESOLVED** — Added `console.warn()` to the stub body that names the module, so developers see a clear warning in the browser console instead of silent `undefined` values.

### SHOULD-FIX #2 — Bare Node.js module names (`"fs"`, `"path"`, `"crypto"`) not intercepted
**Status: DEFERRED** — Many bare names (`events`, `buffer`, `stream`, `util`, `process`, `url`) have legitimate npm polyfill packages. Stubbing them would break apps using those polyfills. The `node:` prefix is the modern standard; third-party packages using bare names would already trigger auto-install even without this bug. Tracked as a potential follow-up if user reports surface.

### SHOULD-FIX #3 — Comment injection in stub response (reflected XSS in dev server)
**Status: RESOLVED** — Switched from `/* */` block comments to `//` line comments. Specifier is sanitized (control chars stripped, quotes/backslashes escaped) before inclusion in JS string literal. Added test with crafted injection payload to verify.

### NIT #4 — Test redundancy
**Status: ACKNOWLEDGED** — Kept for documentation value. Each test exercises a specific module name from the issue report. Low maintenance cost.

### NIT #5 — `is_runtime_builtin` could be shared
**Status: ACKNOWLEDGED** — Current implementation is 1 line. If bare names are added later, extracting to a shared module makes sense.

### NIT #6 — Missing direct unit test for `is_runtime_builtin` negative case
**Status: RESOLVED** — Added `test_is_runtime_builtin_positive` and `test_is_runtime_builtin_negative` unit tests.

## Resolution

All blocker and should-fix findings addressed. Bare name interception deferred with justification. Quality gates re-run and passing after fixes.
