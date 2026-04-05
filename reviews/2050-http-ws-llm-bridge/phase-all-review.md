# Phase All: HTTP-to-WebSocket LLM Bridge Review

- **Author:** viniciusdacal (with Claude Opus 4.6)
- **Reviewer:** Claude Opus 4.6 (adversarial review)
- **Commits:** 3b1a19d95..a97feb525
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/bridge/mod.rs` (new) — Router, config, startup, shared test helpers
- `native/vtz/src/bridge/health.rs` (new) — GET /health handler
- `native/vtz/src/bridge/events.rs` (new) — GET /events SSE handler with subscription filtering
- `native/vtz/src/bridge/command.rs` (new) — POST /command handler
- `native/vtz/src/bridge/tools.rs` (new) — GET /tools handler
- `native/vtz/src/cli.rs` (modified) — `--bridge-port` CLI flag
- `native/vtz/src/config.rs` (modified) — `bridge_port` config field
- `native/vtz/src/main.rs` (modified) — config wiring
- `native/vtz/src/lib.rs` (modified) — `pub mod bridge`
- `native/vtz/src/server/http.rs` (modified) — bridge startup in `start_server_with_lifecycle`
- `native/vtz/src/server/mcp.rs` (modified) — `tool_definitions()` and `execute_tool()` visibility `fn` -> `pub(crate) fn`
- `native/vtz/src/server/mcp_events.rs` (modified) — `KNOWN_EVENTS` and `validate_subscription()` visibility to `pub(crate)`
- `native/vtz/Cargo.toml` (modified) — added `async-stream`, `http-body-util`, `tower-http/cors`

## CI Status

- [x] Quality gates passed at a97feb525
  - `cargo test --all` — 2737 pass, 0 fail, 2 ignored
  - `cargo clippy --all-targets --release -- -D warnings` — clean
  - `cargo fmt --all -- --check` — clean

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases (see findings)
- [ ] No security issues (see finding S1)
- [x] Public API changes match design doc

## Findings

### BLOCKER: None

No blocking issues found. The implementation is solid and well-structured.

### SHOULD-FIX

#### S1. `_bridge_handle` is never awaited on shutdown (Resource Management)

**File:** `native/vtz/src/server/http.rs`, lines 1722-1737

The bridge's `JoinHandle` is stored as `_bridge_handle` (prefixed underscore, signaling it is intentionally unused). When the main server's `axum::serve` returns (line 1753-1756), the function immediately returns `result` without awaiting the bridge task's completion.

The `bridge_shutdown_tx.send(())` at line 1750 correctly signals the bridge to shut down, and `axum::serve` with graceful shutdown will drain active connections. However, there is a race: the main function returns and the tokio runtime may be dropped before the bridge task finishes draining its SSE connections. In practice, for a dev tool, this is unlikely to cause problems because:
- SSE connections are ephemeral
- The bridge responds to shutdown via `watch::Receiver`
- The tokio runtime shutdown process gives spawned tasks time to complete

However, for correctness, the handle should be awaited with a timeout after the main server stops:

```rust
// After axum::serve returns:
if let Some(handle) = _bridge_handle {
    let _ = tokio::time::timeout(Duration::from_secs(2), handle).await;
}
```

**Severity:** Should-fix. No user-visible bug today, but it is a resource management correctness gap that could become a problem if the bridge ever holds state that needs flushing on shutdown.

#### S2. `bridge_shutdown_tx`/`bridge_shutdown_rx` created even when bridge is disabled (Minor Overhead)

**File:** `native/vtz/src/server/http.rs`, lines 1722

The `watch::channel(())` is always created at line 1722, even when `config.bridge_port` is `None`. The channel is moved into the shutdown future regardless (line 1750). This is a trivial allocation, but it would be cleaner to only create the channel when the bridge is actually started:

```rust
let bridge_shutdown_tx = if config.bridge_port.is_some() {
    let (tx, rx) = tokio::sync::watch::channel(());
    // ... start bridge with rx ...
    Some(tx)
} else {
    None
};

// In shutdown_future:
if let Some(tx) = bridge_shutdown_tx {
    let _ = tx.send(());
}
```

**Severity:** Should-fix. Not a bug, but a code hygiene issue. Creates unnecessary allocations for 99% of users who don't use `--bridge-port`.

#### S3. SSE event IDs use `AtomicU64` via `Arc` unnecessarily

**File:** `native/vtz/src/bridge/events.rs`, lines 62

```rust
let event_id = Arc::new(AtomicU64::new(0));
```

The `event_id` counter is only used inside the single `async_stream::stream!` block. It does not need to be `Arc`-wrapped because there is only one consumer. A simple `u64` counter variable would suffice:

```rust
let stream = async_stream::stream! {
    let mut next_id: u64 = 0;
    // ...
    yield Ok(Event::default()
        .id(next_id.to_string())
        .data(server_status.to_json()));
    next_id += 1;
    // ...
};
```

The `Arc<AtomicU64>` suggests the counter might be shared, but it is not. This is misleading and adds unnecessary overhead (atomic operations instead of plain increment).

**Severity:** Should-fix. No bug, but unnecessary complexity and misleading API signal.

#### S4. `subscribed` event not in `KNOWN_EVENTS` -- inconsistency in health response

**File:** `native/vtz/src/server/mcp_events.rs`, lines 137-144 and `native/vtz/src/bridge/health.rs`, line 28

The `KNOWN_EVENTS` array is:
```rust
pub(crate) const KNOWN_EVENTS: &[&str] = &[
    "error_update", "file_change", "hmr_update",
    "ssr_refresh", "typecheck_update", "server_status",
];
```

The `subscribed` event type exists in `McpEvent::Subscribed` and has `event_name() -> "subscribed"`, but it is not included in `KNOWN_EVENTS`. This means:
1. The health endpoint's `available_event_types` does not list `subscribed`
2. If a client subscribes to `subscribe=subscribed`, it is treated as unknown

This is intentionally correct (you would never subscribe to "subscribed" -- it is a meta-event). But the `server_status` event IS in `KNOWN_EVENTS`, even though it is always sent regardless of filters. This inconsistency is confusing.

The design doc says `available_event_types` in the health response should show `["server_status", "error_update", "file_change", "hmr_update", "ssr_refresh", "typecheck_update"]` which matches `KNOWN_EVENTS`. So this aligns with the spec. But `server_status` being both "always sent" and "filterable" is a mild API confusion.

**Severity:** Should-fix (documentation/DX). The `KNOWN_EVENTS` name implies these are subscribable events. `server_status` is always sent as the handshake and is also broadcast on status changes. If a client subscribes to `subscribe=error_update`, they will still get `server_status` as the first event (hardcoded), but if a `server_status` broadcast event comes later through the channel, the filter will DROP it because `server_status` is not in the client's filter set. This is a subtle behavior difference from the initial handshake. Consider documenting this in the design doc or treating `server_status` as always-pass in the filter.

#### S5. No test for SSE event filtering (filter actually drops events)

**File:** `native/vtz/src/bridge/events.rs`, tests section

The test suite covers:
- First event is `server_status`
- Subscribe sends ack
- Unknown events reported in ack
- Broadcast events are relayed

But there is no test verifying that **the filter actually drops non-matching events**. For example: subscribe to `error_update`, broadcast a `file_change`, and assert it does NOT appear in the stream. This is the core filtering behavior and it lacks a test.

**Severity:** Should-fix. Missing test for a core behavior. The code looks correct, but untested behavior is a regression risk.

#### S6. No test for empty subscribe parameter (`?subscribe=`)

**File:** `native/vtz/src/bridge/events.rs`, lines 30-37

The filter parsing handles empty strings by treating them as "no filter":
```rust
let filter: Option<HashSet<String>> = params.subscribe.as_ref().and_then(|s| {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.split(',').map(|s| s.trim().to_string()).collect())
    }
});
```

This is a good defensive measure, but it is not tested. `?subscribe=` (empty) and `?subscribe=  ` (whitespace) should both behave as "subscribe to all". Without a test, a future refactor could break this.

**Severity:** Should-fix. Edge case without test coverage.

### NITS (Non-blocking)

#### N1. Duplicate `body_json` helper in test modules

**Files:** `native/vtz/src/bridge/mod.rs` (line 138), `native/vtz/src/bridge/command.rs` (line 63), `native/vtz/src/bridge/tools.rs` (line 18)

The `body_json` helper function is duplicated three times across test modules. Consider moving it to the shared `tests` module in `bridge/mod.rs` where `make_test_state` already lives:

```rust
// In bridge::tests (mod.rs)
pub(crate) async fn body_json(resp: axum::response::Response<Body>) -> serde_json::Value { ... }
```

Then import from `crate::bridge::tests::body_json` in child modules. This follows the same pattern already established for `make_test_state`.

#### N2. `tools_handler` does not take `State`

**File:** `native/vtz/src/bridge/tools.rs`, line 6

```rust
pub async fn tools_handler() -> impl IntoResponse {
    Json(mcp::tool_definitions())
}
```

This handler calls `tool_definitions()` which returns a static JSON value. This is correct today, but if tool definitions ever become dynamic (e.g., based on server state, loaded plugins, or enabled features), this handler would need refactoring. The other handlers consistently take `State(state)`. For API consistency, consider accepting `State` even if unused today.

This is purely a style nit -- the current code is correct.

#### N3. Design doc says `"active"` but code uses `"active_filter"` in subscribed event

**File:** `plans/2050-http-ws-llm-bridge.md`, line 75 vs `native/vtz/src/server/mcp_events.rs`, line 132

The design doc shows:
```
{"event":"subscribed","data":{"active":["error_update","file_change"],"unknown":[]}}
```

But the actual struct uses `active_filter` and `unknown_events`:
```rust
pub struct SubscribedData {
    pub active_filter: Vec<String>,
    pub unknown_events: Vec<String>,
}
```

The code names are more descriptive and better, but the design doc should be updated to match.

#### N4. `eprintln!` for bridge startup banner (line 73-77 of mod.rs)

The bridge uses `eprintln!` for printing the startup banner, which writes to stderr. This is consistent with the rest of the dev server (which also uses stderr for status messages). Just noting this for awareness -- it is correct behavior.

## Summary

The implementation is clean, well-structured, and closely follows the design doc. The architecture is sound -- sharing `Arc<DevServerState>` in-process eliminates complexity. The visibility changes to `mcp.rs` and `mcp_events.rs` are minimal and appropriate (`pub(crate)` scope). The test suite covers the main happy paths and several edge cases.

The most actionable findings are:
1. **S5** -- Add a test that verifies filtering actually drops non-matching events (core behavior untested)
2. **S3** -- Simplify `Arc<AtomicU64>` to a plain `u64` counter
3. **S1** -- Await bridge handle on shutdown for resource management correctness
4. **S4** -- Document or fix the `server_status` filter behavior (always-sent handshake vs. filtered broadcast)

None of these are blocking. The feature is functional and correct for its intended use case (dev-time LLM bridge).

## Resolution

Pending author response.
