# Phase 0: POC — IPC Round-Trip

## Context

The `vtz` runtime has a webview (`--desktop` flag) using wry + tao, but the `ipc_handler` currently just logs messages. This POC validates that we can dispatch work from the `ipc_handler` (main thread) to a tokio background task and return results via `evaluate_script` through the existing `UserEvent::EvalScript` mechanism.

Design doc: `plans/desktop-ipc-bridge.md`

## Tasks

### Task 1: IPC dispatcher struct + request/response types

**Files:**
- `native/vtz/src/webview/ipc_dispatcher.rs` (new)
- `native/vtz/src/webview/mod.rs` (modified — add `pub mod ipc_dispatcher`)

**What to implement:**

Create the `IpcDispatcher` that captures a `tokio::runtime::Handle` and `EventLoopProxy<UserEvent>`, receives raw IPC request strings from the `ipc_handler`, and dispatches async work.

For the POC, support a single hardcoded method: `fs.readTextFile`.

Types:
```rust
struct IpcRequest { id: u64, method: String, params: serde_json::Value }
enum IpcResult { Ok(serde_json::Value), Err { code: String, message: String } }
```

The dispatcher:
1. Deserializes the raw string into `IpcRequest`
2. Spawns an async task via `handle.spawn()`
3. In the task: reads the file at `params.path`
4. Serializes the response and sends `EvalScript` via `proxy.send_event()`

**Acceptance criteria:**
- [ ] `IpcDispatcher::new(handle, proxy)` compiles
- [ ] `IpcDispatcher::dispatch(body: &str)` deserializes and spawns without blocking
- [ ] File read returns content via `EvalScript` event
- [ ] Non-existent file returns `{ ok: false, error: { code: "NOT_FOUND", message: "..." } }`
- [ ] Unit tests for serialization/deserialization of request/response types
- [ ] `cargo test` passes
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean

---

### Task 2: Wire IPC dispatcher into webview

**Files:**
- `native/vtz/src/webview/mod.rs` (modified — update `run()`)
- `native/vtz/src/webview/ipc_client.js` (new — JS-side promise registry)

**What to implement:**

1. Modify `WebviewApp` to accept an `IpcDispatcher` (or the components needed to build one).
2. In `run()`, replace the logging `ipc_handler` with one that calls `dispatcher.dispatch(body)`.
3. Create a minimal JS IPC client that:
   - Exposes `window.__vtz_ipc.invoke(method, params)` → `Promise<Result>`
   - Keeps a pending promise map keyed by request ID
   - Exposes `window.__vtz_ipc_resolve(id, response)` for Rust to call back
4. Inject the JS IPC client into the webview via `with_initialization_script()`.

**Acceptance criteria:**
- [ ] `WebviewApp::run()` accepts an `IpcDispatcher` parameter
- [ ] `ipc_handler` delegates to `IpcDispatcher::dispatch()`
- [ ] JS client `invoke()` sends JSON via `window.ipc.postMessage()`
- [ ] JS client `__vtz_ipc_resolve()` resolves the correct pending promise
- [ ] Unit tests for JS IPC client (promise registry, timeout)
- [ ] `cargo test` passes
- [ ] `cargo clippy` clean

---

### Task 3: CLI integration + latency measurement

**Files:**
- `native/vtz/src/cli.rs` (modified — wire IpcDispatcher in desktop dev path)
- `native/vtz/src/webview/ipc_dispatcher.rs` (modified — add timing logs)

**What to implement:**

1. In the CLI's `--desktop` code path, construct the `IpcDispatcher` with the tokio handle and event loop proxy, and pass it to `WebviewApp::run()`.
2. Add `[ipc]` log lines showing round-trip latency: time from request received in `ipc_handler` to response sent via `EvalScript`.
3. Create a simple HTML test page (or inject JS into the existing app) that calls `window.__vtz_ipc.invoke('fs.readTextFile', { path: './package.json' })` and logs the result + timing.

**Acceptance criteria:**
- [ ] `vtz dev --desktop` (with desktop feature) starts and the IPC bridge is active
- [ ] Calling `fs.readTextFile` from the browser console works end-to-end
- [ ] Round-trip latency is logged: target < 5ms for a small file
- [ ] Error case (non-existent file) returns proper error response
- [ ] `cargo test --all` passes
- [ ] `cargo clippy` clean
- [ ] `cargo fmt --all -- --check` clean
