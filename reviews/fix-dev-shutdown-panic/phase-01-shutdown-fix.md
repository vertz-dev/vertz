# Phase 1: Shutdown Fix

- **Author:** fix agent
- **Reviewer:** adversarial review agent
- **Commits:** d737b134f
- **Date:** 2026-04-06

## Changes

- `native/vtz/src/server/http.rs` (modified) — added `else => break` to file watcher and dep watcher `tokio::select!` loops; added 2 regression tests
- `native/vtz/src/test/watch.rs` (modified) — added `else => break Ok(())` to test watcher `select!` loop (same busy-wait pattern)

## CI Status

- [x] Quality gates passed (cargo test --all, clippy, fmt)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc (N/A — internal fix)

## Findings

### Approved

**Correctness:** The `else` branch in `tokio::select!` fires only when ALL branches are *disabled*. During normal operation, `rx.recv()` stays pending (not disabled) — it only becomes disabled when the channel closes and the `Some(...)` pattern fails. Combined with an empty debouncer (guard false), this is exclusively a shutdown condition. No spurious firing possible.

**Pending items on shutdown:** When the channel closes with buffered items, the debouncer still processes them: `recv()` drains the buffer first, the sleep branch fires for pending items, and only after the debouncer is empty does `else` fire. Confirmed by test.

**Should-fix (addressed):** `test/watch.rs:193` had the same `Some(change) = rx.recv()` pattern. While it wouldn't panic (sleep branch has no guard), it would busy-wait forever after channel close. Fixed with `else => break Ok(())`.

**Other `select!` blocks audited:** `http.rs:1939`, `http.rs:1984`, `mcp_events.rs:299`, `inspector.rs:232` — none vulnerable (all use unconditionally-enabled futures or handle `None` explicitly).

## Resolution

All findings addressed. Test watcher busy-wait fixed inline (same PR).
