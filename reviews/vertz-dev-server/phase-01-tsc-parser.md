# Phase 1: tsc Output Parser + ErrorCategory + Batch Replace API

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** e5a554f77
- **Date:** 2026-03-28

## Changes

- `native/vertz-runtime/src/errors/categories.rs` (modified) — `TypeCheck` variant added to `ErrorCategory`, `DevError::typecheck()` constructor, `ErrorState::replace_category()`, tests
- `native/vertz-runtime/src/errors/broadcaster.rs` (modified) — `ErrorBroadcaster::replace_category()` with single-broadcast semantics, tests
- `native/vertz-runtime/src/errors/terminal.rs` (modified) — `TYPECHECK ERROR` badge added to `format_error`
- `native/vertz-runtime/src/typecheck/parser.rs` (new) — `TscParsed`, `TscDiagnostic`, `parse_tsc_line()`, `DiagnosticBuffer`, tests
- `native/vertz-runtime/src/typecheck/mod.rs` (new) — module declaration
- `native/vertz-runtime/src/lib.rs` (modified) — `pub mod typecheck`
- `plans/vertz-dev-server/tsc-error-integration.md` (new) — design doc

## CI Status

- [x] Quality gates passed at e5a554f77 (`cargo test` all pass)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests alongside implementation)
- [ ] No type gaps or missing edge cases — **2 findings**
- [x] No security issues
- [x] Parser handles documented edge cases (standard diagnostics, continuations, sentinels with timestamps, singular/plural, warning diagnostics, Windows paths, ignored lines)
- [x] ErrorCategory ordering and suppression is correct
- [x] `active_errors()` hardcoded array includes TypeCheck
- [x] `replace_category()` works correctly for atomic replacement
- [x] Serialization/Display are correct for the new variant
- [x] No dead code
- [x] Code follows existing patterns and conventions

## Findings

### Should-Fix

#### 1. Missing terminal badge test for TypeCheck

`terminal.rs` test `test_category_badges` (line 366) covers Build, Resolve, Ssr, and Runtime but NOT TypeCheck. The badge implementation is correct (`" TYPECHECK ERROR "`), but there is no test asserting it. All other categories are tested — TypeCheck should be too.

**Fix:** Add TypeCheck to the `test_category_badges` test:
```rust
let typecheck = DevError::typecheck("err");
assert!(format_error(&typecheck, None).contains("TYPECHECK ERROR"));
```

#### 2. Stale doc comment on `ErrorCategory` enum

Line 6 of `categories.rs`: `/// Order: Build > Resolve > Ssr > Runtime` — this was not updated to include `TypeCheck`. Should be: `/// Order: Build > Resolve > TypeCheck > Ssr > Runtime`.

Similarly, the `DevError.category` field doc comment (line 49) says `/// Error category (build, resolve, ssr, runtime).` — missing `typecheck`.

### Nit

#### 3. Parser: file paths containing parentheses

`try_parse_diagnostic` uses `line.find('(')` to locate the `(line,col)` portion. This matches the *first* `(` in the string. A file path like `src/components (old)/button.tsx(10,5): error TS2322: ...` would split incorrectly — the file would be `src/components ` and the coords would fail to parse.

In practice, tsc doesn't prevent users from having parentheses in file/directory names, though it's rare. The parser fails gracefully (the coord parse returns `None`, so the line falls through to Continuation or Ignored), meaning no crash but a silently missed diagnostic.

**Recommendation:** Consider using `rfind` to search from the right for the last `(` that precedes `): error` or `): warning`. Alternatively, search for `): error TS` or `): warning TS` as the anchor point and work backwards. This is a nit because the graceful fallback prevents any crash, and parentheses in file paths are uncommon.

#### 4. Spurious Clear broadcast on no-op replace

`ErrorBroadcaster::replace_category(TypeCheck, vec![])` when no TypeCheck errors exist broadcasts a `Clear` message even though nothing changed. The `ErrorState::replace_category` returns `should_surface = true` (because the category is not suppressed), then `broadcast_current_state_or_clear()` broadcasts Clear. Harmless (the overlay is already clear), but slightly noisy. Not worth fixing unless it causes test flakiness.

### Approved (no issues)

- **ErrorCategory discriminant shift.** Resolve 2->3, Build 3->4. Since serialization uses `rename_all = "lowercase"` (string-based), the numeric shift has zero wire format impact. Correct.
- **`active_errors()` hardcoded array.** TypeCheck is in the correct position (after Resolve, before Ssr). Priority ordering is verified by tests.
- **`replace_category()` semantics.** Empty vec removes the category. Non-empty vec replaces. Return value correctly indicates suppression status. Three dedicated tests cover swap, clear, and cross-category isolation.
- **`ErrorBroadcaster::replace_category()`.** Single broadcast, suppression-aware, error log written. Three async tests: single-message broadcast, empty-clears, suppressed-no-broadcast.
- **Parser coverage.** Standard diagnostics, warnings, Windows paths, high line/col numbers, continuations (2-space and 4-space indented), sentinels (12h, 24h, singular, plural, zero, large count), ignored lines (compilation start, file change, empty, whitespace-only), multi-pass buffer, zero-error flush, `to_dev_error()` conversion. Thorough.
- **`DiagnosticBuffer`.** Feed/flush cycle is clean. Continuation lines append correctly. Multiple compilation passes work (buffer resets on sentinel). `has_content` flag is tracked but not yet consumed externally — future phases will likely use it for lifecycle logging.
- **`TscDiagnostic::to_dev_error()`.** Correctly prefixes the TS code to the message (`TS2322: ...`), sets file and location. Clean builder chain.

## Resolution

**Changes Requested** — 2 should-fix items:

1. Add TypeCheck to `test_category_badges` test in `terminal.rs`
2. Update stale doc comments on `ErrorCategory` enum (line 6) and `DevError.category` field (line 49) to include `typecheck`

Both are small, low-risk fixes. The parser parentheses nit (#3) and spurious clear nit (#4) can be deferred.
