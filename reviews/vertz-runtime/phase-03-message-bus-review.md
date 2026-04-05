# Phase 3: Message Bus — Adversarial Review

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/runtime/message_bus.rs` (new)

## CI Status

- [x] Quality gates passed after fixes

## Findings

### BLOCKER 1: ChannelFull/Closed errors hardcode entity name
Entity name was lost in `try_send` error mapping (hardcoded "unknown"/"closed").
**Resolution:** Extracted entity name before moving msg. Added `IsolateClosed` variant for dropped receivers.

### BLOCKER 2: BusResponse dual-state ambiguity
`BusResponse` had both `payload` and `Option<error>` — inconsistent state possible.
**Resolution:** Changed `response_tx` to `oneshot::Sender<Result<Vec<u8>, BusError>>`. Removed `BusResponse` struct entirely.

### BLOCKER 3: check_deadlock O(n) and no self-loop test
`Vec::contains` is O(n); no test for self-loop case.
**Resolution:** Made `check_deadlock` a free function using `HashSet` for O(1) lookup. Added self-loop test.

### BLOCKER 4: async send uses try_send — broken backpressure
`send` was `async` but used synchronous `try_send`, lying about backpressure semantics. `Timeout` variant was dead code.
**Resolution:** Changed to `sender.send(msg).await` wrapped in `tokio::time::timeout(30s)`. Timeout variant is now reachable.

### SHOULD-FIX 1: Default reads env vars
`Default::default()` reading env vars makes tests environment-sensitive.
**Resolution:** Created `from_env()` constructor. `Default` now returns deterministic values.

### SHOULD-FIX 2: No channel_capacity=0 guard
tokio panics on `mpsc::channel(0)` with no validation.
**Resolution:** Added `assert!(config.channel_capacity > 0)` in `create()` with test.

### SHOULD-FIX 3: Missing thiserror — policy violation
Hand-rolled Display + Error impl instead of `#[derive(thiserror::Error)]`.
**Resolution:** Switched to thiserror with single-line `#[error(...)]` attributes.

### SHOULD-FIX 4: Multi-line Display breaks structured logs
SerializationError and DeadlockDetected used `\n` in Display.
**Resolution:** All error messages are now single-line via thiserror attributes.

### NIT: check_deadlock on MessageBus
Pure function unnecessarily tied to MessageBus as associated method.
**Resolution:** Made it a free function in the module.

## Resolution

All 4 blockers and 4 should-fixes resolved. Tests expanded from 13 to 20.
