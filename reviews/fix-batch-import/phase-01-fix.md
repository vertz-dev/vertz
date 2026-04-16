# Phase 1: Fix false-positive batch() import injection

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial review agent)
- **Commits:** 252c0e392..90739b003
- **Date:** 2026-04-15

## Changes

- native/vertz-compiler-core/src/import_injection.rs (modified)

## CI Status

- [x] Quality gates passed at 90739b003

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Changes Requested (resolved)

1. **BLOCKER: `*` generator check had no boundary validation** — `a * batch(fn)` was falsely excluded because the `*` was unconditionally treated as a generator star. Fixed by checking the token before `*` (expression-producing tokens like identifiers, `)`, `]` indicate multiplication).

2. **SHOULD-FIX: Missing test for `static async` compound keyword** — Added test.

3. **SHOULD-FIX: Missing tests for `return`/`await`/`yield`/`void` contexts** — Added regression tests confirming these are still detected as standalone calls.

4. **NOTE: Shorthand method `{ batch(items) }` false positive** — Pre-existing bug, not introduced by this PR. Tracked as #2684.

## Resolution

All blocker and should-fix findings resolved in commit 90739b003. Pre-existing issue tracked in #2684.
