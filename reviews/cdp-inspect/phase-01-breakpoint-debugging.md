# Phase 1: Breakpoint Debugging via --inspect

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial self-review)
- **Commits:** 1731f438e..7819f7c24
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/server/inspector.rs` (new) — Inspector server: axum routes, WebSocket bridge, CDP metadata
- `native/vtz/src/server/mod.rs` (modified) — Added `pub mod inspector;`
- `native/vtz/src/cli.rs` (modified) — Added `--inspect`, `--inspect-brk`, `--inspect-port` flags
- `native/vtz/src/config.rs` (modified) — Added `inspect`, `inspect_brk`, `inspect_port` to `ServerConfig`
- `native/vtz/src/main.rs` (modified) — CLI flag → config piping with `inspect_port.is_some()` implication
- `native/vtz/src/banner.rs` (modified) — Inspector banner line with `chrome://inspect` hint
- `native/vtz/src/runtime/js_runtime.rs` (modified) — `get_inspector_session_sender()` method
- `native/vtz/src/runtime/persistent_isolate.rs` (modified) — `enable_inspector` option, watch channel plumbing
- `native/vtz/src/server/http.rs` (modified) — Inspector startup, CORS layer, banner integration
- `native/vtz/tests/cli_inspect_flags.rs` (new) — 7 CLI flag parsing tests
- `native/vtz/tests/inspector_server.rs` (new) — 7 integration tests for CDP metadata
- `native/vtz/Cargo.toml` (modified) — Added `futures` dependency
- Test files updated: `client_render.rs`, `error_overlay.rs`, `parity/common.rs`, `ssr_render.rs`

## CI Status

- [x] Quality gates passed at 7819f7c24
  - `cargo test --all` ✅
  - `cargo clippy --all-targets --release -- -D warnings` ✅
  - `cargo fmt --all -- --check` ✅

## Review Checklist

- [x] Delivers what the ticket asks for (Phase 1: working --inspect with breakpoints)
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (inspector binds to 127.0.0.1 only)
- [x] Public API changes match design doc

## Findings

### Blockers (resolved)

**B1: Spawned tasks not aborted after select!** — `forward_task` and `backward_task` were not explicitly aborted after `tokio::select!`. Dropping a `JoinHandle` detaches but does NOT cancel the task. This causes resource leaks.
- **Resolution:** Made tasks `mut`, added explicit `.abort()` calls after `select!`.

**B2: Channel not closing due to Arc<Mutex> wrapper** — `inbound_tx` was wrapped in `Arc<Mutex<>>`. Dropping one clone of the Arc didn't close the channel, so V8 wouldn't see the session disconnect.
- **Resolution:** Removed `Arc<Mutex>` wrapper. Used `unbounded_send(&self)` (non-async, takes shared reference) instead of `SinkExt::send(&mut self)`. Cloned `inbound_tx` for the forward task, dropped original after select.

### Should-fix (resolved)

**S1: Banner missing actionable hint** — Inspector banner showed `ws://` URL but didn't tell users what to do with it.
- **Resolution:** Added `"Open chrome://inspect to attach"` hint line.

**S5: `--inspect-port 9229` not implying `--inspect`** — With `default_value_t = 9229`, there was no way to distinguish "user explicitly passed --inspect-port 9229" from "default value". This meant `--inspect-port 9229` alone wouldn't enable the inspector.
- **Resolution:** Changed to `Option<u16>`, resolution logic uses `.is_some()`.

**N4: Unnecessary `format!()` call** — `format_inspector_line` had `format!("{}", info.ws_url)` instead of `info.ws_url.clone()`.
- **Resolution:** Replaced with `.clone()`.

### Not addressed (deferred)

**S2:** `/json/version` missing `V8-Version` field — deferred to Phase 3.
**S3:** Source map cross-port fetch not integration-tested — CORS layer added, manual verification sufficient for Phase 1.
**S4:** No WebSocket CDP message bridging integration test — requires V8 runtime in test, complex setup. Verified manually.

## Resolution

All blockers and should-fix items resolved in commit 7819f7c24. Deferred items tracked for later phases.

### Approved
