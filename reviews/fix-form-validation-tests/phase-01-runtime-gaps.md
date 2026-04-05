# Phase 1: Fix Form Validation Tests — Schema Runtime Gaps

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial)
- **Date:** 2026-04-05

## Changes

- `native/vertz-compiler-core/src/typescript_strip.rs` (modified) — Added `visit_formal_parameter` to strip `?` from optional function params
- `native/vtz/src/runtime/module_loader.rs` (modified) — Added self-referencing package resolution + 2 unit tests
- `native/vtz/src/test/dom_shim.rs` (modified) — Added Blob/File classes, fixed FormData to preserve Blob instances
- `native/vtz/src/test/globals.rs` (modified) — Added `toBeArray` matcher

## CI Status

- [x] Quality gates passed — `cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check`

## Review Checklist

- [x] Delivers what the ticket asks for (4 form validation tests passing)
- [x] TDD compliance (tests written for each fix)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc (N/A — internal runtime fixes)

## Findings

### Approved

**Should-fix items identified and resolved:**

1. **Self-referencing resolution unit tests** — Added `test_resolve_self_referencing_with_exports_subpath` and `test_resolve_self_referencing_main_entry` to prevent regressions.

2. **FormData filename argument** — Updated `set(name, value, filename)` and `append(name, value, filename)` to support the optional third argument per Web API spec.

**Nits (accepted as-is):**

- `Blob.size` uses string `.length` (UTF-16 code units) instead of byte length. Acceptable for test shim.
- `Blob._parts` uses underscore convention but is technically accessible. No code accesses it.
- `Blob.stream()` not implemented. Not needed by any current test.
- Test assertion `!result.contains('?')` could false-positive with ternary operators, but test input is controlled.

**Pre-existing issue found:**
- `form.reset()` not implemented in DOM shim — tracked as #2329.

## Resolution

All should-fix items addressed. No remaining blockers.
