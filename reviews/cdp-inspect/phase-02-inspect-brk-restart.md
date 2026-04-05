# Phase 2: --inspect-brk Pause + Inspector Restart Resilience

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial self-review)
- **Commits:** 44d96671b..dc4605ef2
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/runtime/js_runtime.rs` (modified) — Added `wait_for_session_and_break()` method
- `native/vtz/src/runtime/persistent_isolate.rs` (modified) — `inspect_brk` field, `inspector_session_tx` shared watch channel, one-shot clearing, `isolate_event_loop` signature updated
- `native/vtz/src/server/http.rs` (modified) — Added `inspect_brk` and `inspector_session_tx` to options construction
- `native/vtz/tests/inspector_brk.rs` (new) — 6 tests: field existence, defaults, blocking, unblocking, banner, non-brk
- `native/vtz/tests/inspector_restart.rs` (new) — 3 tests: shared channel, preserved tx, one-shot brk
- `native/vtz/tests/ssr_render.rs` (modified) — Added new fields to all 8 constructors

## CI Status

- [x] Quality gates passed at dc4605ef2
  - `cargo test --all` ✅
  - `cargo clippy --all-targets --release -- -D warnings` ✅
  - `cargo fmt --all -- --check` ✅

## Review Checklist

- [x] Delivers what the ticket asks for (Phase 2: --inspect-brk pause + restart resilience)
- [x] TDD compliance (9 tests written before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Blockers (resolved)

**B1: `inspect_brk` not cleared on restart** — When `inspect_brk: true` was set and the isolate restarted (e.g., file watcher triggered), `options.clone()` preserved `inspect_brk: true`. Every restart would block the V8 thread waiting for a debugger, causing the dev server to hang indefinitely on file save.
- **Resolution:** Added `options.inspect_brk = false` in `PersistentIsolate::new()` after the first creation. Cloned options for restart always have `inspect_brk: false`. Added regression test `test_restart_with_inspect_brk_does_not_block_new_isolate`.

### Should-fix: none

### Notes

**N1: Complex test setup for unblock test** — `test_inspect_brk_unblocks_after_debugger_connects` requires deep knowledge of deno_core's `poll_sessions` internals (pre-sending `Runtime.runIfWaitingForDebugger`, delayed `Debugger.enable` + `Debugger.resume`). Well-documented with inline comments explaining the V8 thread parking mechanism.

**N2: Watch channel pattern** — The `Arc<watch::Sender>` stored in options is an elegant solution for restart resilience. Inspector server holds a receiver from the first isolate, and all subsequent isolates publish to the same sender. No need to reconnect the server.

## Resolution

B1 resolved in commit dc4605ef2. Regression test added. All quality gates pass.

### Approved
