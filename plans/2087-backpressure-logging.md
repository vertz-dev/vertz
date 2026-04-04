# Design: Structured Backpressure Logging for Channel Drops (#2087)

## Summary

When `try_send` fails due to full channels in the file watcher and dependency watcher, log a rate-limited warning so developers know file change events are being dropped.

## Context

The file watcher (`FileWatcher`) and dependency watcher (`DepWatcher`) use `mpsc::channel(256)` to send events to the server. Both use `let _ = tx.try_send(change);` — silently discarding events when the channel is full. This means developers get no indication that HMR or compilation cache invalidation missed file changes.

Found during adversarial review of #2077 (persistent V8 isolate).

### Affected files

- `native/vtz/src/watcher/file_watcher.rs` — line 90: `let _ = tx.try_send(change);`
- `native/vtz/src/watcher/dep_watcher.rs` — line 100: `let _ = tx.try_send(change);`

## API Surface

This is a Rust-internal change with no TypeScript API. The "API" is the log output format visible to developers in the terminal.

### Log format

First drop (includes actionability hint):
```
[Server] File watcher channel full — dropped event for src/Button.tsx (Modify). Save again or refresh the browser.
[Server] Dep watcher channel full — dropped event for packages/ui/dist/index.js (@myorg/ui). Save again or refresh the browser.
```

Subsequent drops (includes count of suppressed drops since last warning):
```
[Server] File watcher channel full — dropped 12 events in the last 1.0s
[Server] Dep watcher channel full — dropped 5 events in the last 1.0s
```

Follows the existing `[Server]` prefix convention used throughout the codebase (e.g., `[Server] Upstream dep changed: ...`).

### Rate limiting

At most **one warning per second per channel**. During rapid saves that exceed channel capacity, the first drop logs immediately with the file path and an actionability hint. Subsequent drops within 1 second are counted silently. When the cooldown expires and the next drop occurs, a summary is logged with the count of suppressed drops.

### Implementation approach

A `BackpressureWarner` struct with an injectable callback for testability. The struct tracks:
- `last_warn: Option<Instant>` — when the last warning was logged
- `cooldown: Duration` — minimum interval between warnings (1 second)
- `suppressed_count: u32` — drops suppressed since last warning
- `warn_fn: F` — injectable callback (production: `eprintln!`, tests: `Vec<String>`)

```rust
pub struct BackpressureWarner<F: FnMut(&str)> {
    channel_name: String,
    last_warn: Option<Instant>,
    cooldown: Duration,
    suppressed_count: u32,
    warn_fn: F,
}

impl<F: FnMut(&str)> BackpressureWarner<F> {
    pub fn new(channel_name: &str, cooldown: Duration, warn_fn: F) -> Self { ... }

    /// Called when try_send fails. Logs immediately on first drop,
    /// then rate-limits subsequent warnings with a suppressed count.
    pub fn on_drop(&mut self, detail: &str) { ... }
}
```

Usage in watchers:
```rust
let mut warner = BackpressureWarner::new("File watcher", Duration::from_secs(1), |msg| {
    eprintln!("{}", msg);
});

// Inside callback, replacing `let _ = tx.try_send(change);`:
if tx.try_send(change).is_err() {
    warner.on_drop(&format!("{} ({:?})", path.display(), kind));
}
```

## Manifesto Alignment

- **Principle 7 (Performance is not optional)**: Backpressure is a performance concern. When the system can't keep up, developers need visibility to diagnose and fix the bottleneck.
- **Principle 1 (If it builds, it works)**: Silent event drops violate this — code changes don't trigger expected HMR updates, but no error is surfaced.
- **Principle 3 (AI agents are first-class users)**: AI agents driving tight edit loops are more likely to hit backpressure. Visible drops help diagnose stale HMR in agent workflows.
- **Tradeoff**: We accept the minor overhead of an `Instant::now()` call on each drop (nanoseconds). The `try_send` success path has zero additional overhead — no timing calls, no branch taken.

## Non-Goals

- **Increasing channel capacity** — 256 is already generous; backpressure indicates a systemic issue, not a buffer-size issue.
- **Retry or queue mechanism** — `try_send` is correct in a callback context (can't block the notify thread). Drops are acceptable; visibility is the goal.
- **Structured logging framework** — The codebase uses `eprintln!` consistently. Introducing `tracing` or `log` is out of scope for this issue.
- **Broadcasting drop events to clients** — No WebSocket notification or error overlay for channel drops. Terminal log is sufficient.
- **VERTZ_DEBUG integration** — The `VERTZ_DEBUG` env var infrastructure exists on the TypeScript side only. Rust-side integration is a separate initiative.

## Unknowns

None identified. The approach is straightforward.

## POC Results

N/A — no POC needed for this change.

## Type Flow Map

N/A — no generics involved. Pure Rust internal implementation.

## E2E Acceptance Test

### Test 1: BackpressureWarner logs on first drop with detail

```rust
#[test]
fn test_warns_on_first_drop_with_detail() {
    // Given: a BackpressureWarner with a Vec<String> callback
    // When: on_drop is called with "src/Button.tsx (Modify)"
    // Then: callback receives message containing "channel full", the detail, and "Save again"
}
```

### Test 2: Rate limiting suppresses rapid warnings and counts drops

```rust
#[test]
fn test_suppresses_within_cooldown_and_counts() {
    // Given: a BackpressureWarner with 1-second cooldown
    // When: on_drop is called 10 times rapidly (within 1 second)
    // Then: only 1 warning is emitted, suppressed_count is 9
    // When: cooldown elapses and on_drop is called again
    // Then: a summary warning is emitted with "dropped 9 events"
}
```

### Test 3: Zero overhead on success path

```rust
#[test]
fn test_try_send_success_no_overhead() {
    // Given: a channel with capacity
    // When: try_send succeeds
    // Then: no BackpressureWarner methods are called (verified by zero callback invocations)
}
```

## Design Reviews

### DX Review — APPROVED WITH SUGGESTIONS
- Adopted: actionability hint on first drop ("Save again or refresh")
- Adopted: update dev server debugging guide with new log marker
- Adopted: drop count in subsequent warnings

### Product/Scope Review — APPROVED WITH SUGGESTIONS
- Adopted: drop count summary for magnitude visibility
- Adopted: zero-overhead happy path assertion
- Adopted: injectable callback for testability
- Deferred: VERTZ_DEBUG=watcher integration (Rust-side infrastructure doesn't exist yet)

### Technical Review — APPROVED WITH SUGGESTIONS
- Adopted: injectable callback (`BackpressureWarner<F: FnMut(&str)>`) for testability
- Adopted: renamed `DropWarner` → `BackpressureWarner` (avoids `Drop` trait confusion)
- Noted: multiple paths per notify event — only first drop per callback logs (by design, rate-limited)
- Confirmed: `Option<Instant>` is `Send`, `FnMut` captures are safe, no thread safety concerns

## Implementation Plan

Single phase — this is a small, focused change.

### Phase 1: Add rate-limited backpressure warnings

**Files (5):**
1. `native/vtz/src/watcher/backpressure.rs` (new) — `BackpressureWarner<F>` utility with injectable callback
2. `native/vtz/src/watcher/mod.rs` (modify) — add `pub mod backpressure;`
3. `native/vtz/src/watcher/file_watcher.rs` (modify) — use `BackpressureWarner` on `try_send` failure
4. `native/vtz/src/watcher/dep_watcher.rs` (modify) — use `BackpressureWarner` on `try_send` failure
5. `.claude/rules/dev-server-debugging.md` (modify) — add new log markers to Terminal Log Markers table

**Acceptance criteria:**
- [ ] First `try_send` failure logs `[Server] <channel> channel full — dropped event for <path> (<detail>). Save again or refresh the browser.`
- [ ] Subsequent failures within cooldown are counted; next warning after cooldown shows `dropped N events in the last 1.0s`
- [ ] Warnings are rate-limited to at most 1 per second per channel
- [ ] `try_send` success path has zero additional overhead (no timing calls)
- [ ] Unit test: `BackpressureWarner` warns on first drop with detail and actionability hint
- [ ] Unit test: `BackpressureWarner` suppresses rapid warnings, counts drops, logs summary after cooldown
- [ ] Unit test: zero callback invocations when `try_send` succeeds
- [ ] Dev server debugging guide updated with new log markers
- [ ] `cargo test --all` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` passes
- [ ] `cargo fmt --all -- --check` passes
