# Phase 1: Process Group Kill Fix

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial)
- **Commits:** 4cd65e06b..5d2b27f6c
- **Date:** 2026-04-12

## Changes

- `native/vtz/src/webview/ipc_handlers/shell.rs` (modified) -- added `process_group(0)` to `spawn()`
- `native/vtz/src/webview/process_map.rs` (modified) -- changed `kill()` and `kill_all()` to use negative PID for process group kill, added `#[cfg(unix)]` guards, added integration test

## CI Status

- [x] Quality gates passed at 5d2b27f6c
- [x] All 9 process_map tests pass
- [x] All 21 shell handler tests pass
- [x] Full vtz test suite (3286+ tests) passes with desktop feature
- [x] clippy clean (--release -D warnings)
- [x] rustfmt clean

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (failing test written first, then fix applied)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Mirrors existing pattern from execute() (#2509)

## Findings

### Approved with one should-fix

**SHOULD-FIX (addressed):** `process_map.rs` called `libc::kill()` without `#[cfg(unix)]` guards. Pre-existing issue but cheap to fix while touching the code. Fixed in commit 5d2b27f6c.

**Noted (no action needed):** PID 0 edge case -- `ProcessMap` doesn't guard against PID 0 being inserted, which would cause `kill(0, SIGKILL)` targeting the caller's own process group. Mitigated by `spawn()` validating PID via `.ok_or_else()`. Internal API, acceptable risk.

## Resolution

Should-fix finding addressed in follow-up commit. No remaining blockers.
