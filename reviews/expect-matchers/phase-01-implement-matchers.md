# Phase 1: Implement Missing Expect Matchers

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** 6835d5801..HEAD
- **Date:** 2026-04-04

## Changes

- `native/vtz/src/test/globals.rs` (modified)

## CI Status

- [x] Quality gates passed (cargo test + clippy + fmt)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### SHOULD-FIX (resolved): Missing test for negative n

`toHaveBeenNthCalledWith(-1, ...)` validation was correct in code (`n < 1`) but had no test. Added.

### SHOULD-FIX (resolved): Missing test for non-integer n

`toHaveBeenNthCalledWith(1.5, ...)` validation was correct in code (`!Number.isInteger(n)`) but had no test. Added.

### SHOULD-FIX (resolved): Missing test for predicate throw propagation

`toSatisfy` with a predicate that throws TypeError should propagate the error. Behavior was correct but untested. Added.

### ADVISORY (no action): Circular reference false negatives

Both `deepEqual` and `strictDeepEqual` return `false` for circular structures (conservative). Consistent with existing behavior, not a regression.

### ADVISORY (no action): `toSatisfy` placement

`toSatisfy` placed near mock matchers instead of general matchers. Style-only concern, not worth churning.

## Resolution

All three SHOULD-FIX findings addressed by adding test cases. Re-ran quality gates: 57/57 tests pass, clippy clean, fmt clean.
