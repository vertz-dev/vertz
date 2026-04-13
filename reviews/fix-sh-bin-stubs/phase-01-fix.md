# Phase 1: Fix .sh bin stub wrapping

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Date:** 2026-04-13

## Changes

- `native/vtz/src/pm/bin.rs` (modified) — conditionally omit `node` wrapper for `.sh` targets

## CI Status

- [x] Quality gates passed (`cargo test --all`, `cargo clippy --release`, `cargo fmt --check`)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (failing test first, then minimal fix)
- [x] No type gaps or missing edge cases (critical ones)
- [x] No security issues
- [x] Public API unchanged

## Findings

### Approved

Fix is correct, minimal, and properly scoped. Three new tests cover workspace `.sh`, npm `.sh`, and `.js` regression. Nice-to-haves noted (case sensitivity, other shell extensions) are negligible risk — no real-world packages use those patterns.

## Resolution

No changes needed.
