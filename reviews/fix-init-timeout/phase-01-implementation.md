# Phase 1: Init Timeout Implementation

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial review agent)
- **Commits:** single phase
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/runtime/persistent_isolate.rs` (modified) — Added `init_timeout` field, `DEFAULT_INIT_TIMEOUT`, `wait_for_init()` method, 2 tests
- `native/vtz/src/server/http.rs` (modified) — Background init monitor using `wait_for_init()`
- `native/vtz/tests/ssr_render.rs` (modified) — Added `init_timeout: None` to struct literals

## CI Status

- [x] Quality gates passed — `cargo test --all`, `cargo clippy --all-targets --release -- -D warnings`, `cargo fmt --all -- --check`

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (test written before implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved with should-fix items (all resolved)

1. **SHOULD-FIX (resolved):** `timeout.as_secs()` truncated sub-second durations — changed to `as_secs_f64()`
2. **SHOULD-FIX (resolved):** `init_timeout: None` hardcoded in http.rs without explanation — added comment
3. **SHOULD-FIX (resolved):** Busy-wait test used 10s JS loop — reduced to 3s

### Nits (acknowledged, not blocking)

4. `INIT_EVENT_LOOP_TIMEOUT` (30s) vs `DEFAULT_INIT_TIMEOUT` (10s) UX mismatch — acceptable since monitor only logs a warning
5. Manual `wait_for_init` helpers in ssr_render.rs could be replaced — low priority cleanup

## Resolution

All should-fix items addressed. Quality gates re-verified after fixes.
