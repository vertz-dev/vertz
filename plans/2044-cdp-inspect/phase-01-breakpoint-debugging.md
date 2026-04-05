# Phase 1: Working Breakpoint Debugging

## Context

This phase implements the thinnest end-to-end slice of Chrome DevTools Protocol support for the Vertz runtime (#2044). After this phase, a developer can run `vtz dev --inspect`, connect Chrome DevTools or VS Code, set a breakpoint in their `.tsx` source, trigger an SSR render, and hit the breakpoint.

Design doc: `plans/2044-cdp-inspect.md` (Rev 3)

## Tasks

### Task 1: CLI flags + ServerConfig plumbing

**Files:** (4)
- `native/vtz/src/cli.rs` (modified)
- `native/vtz/src/config.rs` (modified)
- `native/vtz/src/main.rs` (modified)
- `native/vtz/tests/cli_inspect_flags.rs` (new)

**What to implement:**

Add three new fields to `DevArgs` (clap struct in `cli.rs`):

```rust
/// Enable the V8 inspector for Chrome DevTools debugging
#[arg(long)]
pub inspect: bool,

/// Enable the V8 inspector and pause at first statement of entry module
#[arg(long, conflicts_with = "inspect")]
pub inspect_brk: bool,

/// Inspector port (default: 9229). Implies --inspect.
#[arg(long, default_value_t = 9229)]
pub inspect_port: u16,
```

Add three new fields to `ServerConfig` (in `config.rs`):

```rust
/// Whether the V8 inspector is enabled (--inspect, --inspect-brk, or --inspect-port).
pub inspect: bool,
/// Whether to pause at first statement (--inspect-brk).
pub inspect_brk: bool,
/// Inspector port (default 9229).
pub inspect_port: u16,
```

Default `inspect_port` to `9229` in `ServerConfig::new()`.

Update `build_dev_config()` in `main.rs` to resolve flag implications:

```rust
config.inspect_brk = args.inspect_brk;
config.inspect_port = args.inspect_port;
// --inspect-brk implies --inspect, --inspect-port != 9229 implies --inspect
config.inspect = args.inspect || args.inspect_brk || args.inspect_port != 9229;
```

**Acceptance criteria:**
- [ ] `vtz dev --inspect` parses correctly, `config.inspect == true`
- [ ] `vtz dev --inspect-brk` parses correctly, `config.inspect == true && config.inspect_brk == true`
- [ ] `vtz dev --inspect-port 9230` parses correctly, `config.inspect == true && config.inspect_port == 9230`
- [ ] `vtz dev --inspect --inspect-brk` produces a clap error (conflicts_with)
- [ ] `vtz dev` (no flags) has `config.inspect == false`
- [ ] Unit tests in `cli_inspect_flags.rs` verify all flag combinations

---

### Task 2: InspectorServer — HTTP metadata + WebSocket CDP bridge

**Files:** (3)
- `native/vtz/src/server/inspector.rs` (new)
- `native/vtz/src/server/mod.rs` (modified — add `pub mod inspector;`)
- `native/vtz/tests/inspector_server.rs` (new)

**What to implement:**

Create `inspector.rs` with the `InspectorServer` struct. This is an axum-based HTTP+WebSocket server on a separate port (default 9229) that bridges Chrome DevTools Protocol messages between a WebSocket client and the V8 inspector.

**Core struct:**

```rust
use deno_core::InspectorSessionProxy;
use futures::channel::mpsc::UnboundedSender;
use tokio::sync::watch;
use uuid::Uuid;

pub struct InspectorServer {
    /// Unique identifier for this inspector target.
    target_id: Uuid,
    /// Inspector port.
    port: u16,
    /// Dev server port (for source map URLs in metadata).
    dev_port: u16,
    /// Watch receiver for the current session sender.
    /// Updated when the isolate restarts (Phase 2).
    session_sender_rx: watch::Receiver<Option<UnboundedSender<InspectorSessionProxy>>>,
}
```

**HTTP routes (axum):**
- `GET /json/version` — Returns JSON: `{ "Browser": "Vertz/0.1.0-dev", "Protocol-Version": "1.3", "webSocketDebuggerUrl": "ws://127.0.0.1:<port>/<uuid>" }`
- `GET /json` and `GET /json/list` — Returns JSON array with one target entry (see design doc)
- `GET /<uuid>` — WebSocket upgrade → CDP bridge

**WebSocket bridge task:**

When a WebSocket client connects at `/<uuid>`:
1. Get the current `UnboundedSender<InspectorSessionProxy>` from the watch channel
2. Create two `futures::channel::mpsc::unbounded()` channel pairs for the proxy:
   - `outbound_tx/outbound_rx` — V8 → client (type: `InspectorMsg`)
   - `inbound_tx/inbound_rx` — client → V8 (type: `String`)
3. Create `InspectorSessionProxy { tx: outbound_tx, rx: inbound_rx }`
4. Send the proxy through the session sender: `sender.unbounded_send(proxy)`
5. Run two concurrent loops:
   - **Forward loop:** Read from WebSocket → write String to `inbound_tx`
   - **Backward loop:** Read `InspectorMsg` from `outbound_rx` → write `msg.content` to WebSocket
6. On disconnect: drop channels (V8 side detects closed session)

**Single-session enforcement:** Track the active WebSocket connection. If a new client connects, close the previous one (send WebSocket close frame, drop channels).

**Public API:**

```rust
impl InspectorServer {
    pub fn new(
        port: u16,
        dev_port: u16,
        session_sender_rx: watch::Receiver<Option<UnboundedSender<InspectorSessionProxy>>>,
    ) -> Self;

    /// Start the inspector HTTP+WebSocket server. Returns the WebSocket URL.
    pub async fn start(&self) -> Result<String, std::io::Error>;

    /// Get the WebSocket debugger URL.
    pub fn ws_url(&self) -> String;

    /// Get the chrome-devtools:// URL (for /json metadata, not banner).
    pub fn devtools_url(&self) -> String;
}
```

**Acceptance criteria:**
- [ ] `GET /json/version` returns valid JSON with correct fields
- [ ] `GET /json` returns a target list with `webSocketDebuggerUrl`
- [ ] WebSocket connection at `/<uuid>` is accepted
- [ ] WebSocket connection at wrong path returns 404
- [ ] Only one WebSocket session at a time (second connection disconnects first)
- [ ] CDP messages flow: send `{"id":1,"method":"Runtime.enable"}` via WS, receive a response
- [ ] Unit tests for metadata endpoint JSON structure
- [ ] Integration test: start server, connect WS, send `Runtime.enable`, verify response

---

### Task 3: Banner integration

**Files:** (2)
- `native/vtz/src/banner.rs` (modified)
- `native/vtz/tests/banner_inspector.rs` (new)

**What to implement:**

Add an `InspectorInfo` struct and modify `print_banner_with_upstream` to accept it:

```rust
/// Information about the inspector for banner display.
pub struct InspectorInfo {
    /// WebSocket URL (e.g., "ws://127.0.0.1:9229/<uuid>")
    pub ws_url: String,
    /// Whether --inspect-brk was used (shows "Waiting for debugger" message)
    pub inspect_brk: bool,
}
```

Update `print_banner_with_upstream` signature:

```rust
pub fn print_banner_with_upstream(
    config: &ServerConfig,
    startup_time: Duration,
    upstream_packages: &[String],
    inspector: Option<&InspectorInfo>,
)
```

When `inspector` is `Some`:
- Print `Debugger:` line with the `ws_url` (cyan + underline, like other URLs)
- Print second line: `Open chrome://inspect to attach` (dimmed)
- When `inspect_brk` is true, also print: `Paused:    Waiting for debugger to attach...` (yellow)

**Acceptance criteria:**
- [ ] Banner without inspector is unchanged (no regression)
- [ ] Banner with `--inspect` shows `Debugger:` line and `chrome://inspect` hint
- [ ] Banner with `--inspect-brk` additionally shows `Paused:` line
- [ ] Unit tests verify banner output contains expected strings

---

### Task 4: Wire everything in http.rs + PersistentIsolate

**Files:** (4)
- `native/vtz/src/server/http.rs` (modified)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified)
- `native/vtz/src/runtime/js_runtime.rs` (no changes needed — `enable_inspector` already exists)
- `native/vtz/Cargo.toml` (modified — add `uuid` dependency if not present)

**What to implement:**

**In `persistent_isolate.rs`:**

Add fields to `PersistentIsolateOptions`:

```rust
/// Enable the V8 inspector for debugging.
pub enable_inspector: bool,
/// Watch sender to publish the inspector session sender after isolate creation.
/// The InspectorServer subscribes to this to receive new session senders on restart.
pub session_sender_tx: Option<Arc<tokio::sync::watch::Sender<Option<futures::channel::mpsc::UnboundedSender<deno_core::InspectorSessionProxy>>>>>,
```

Modify `isolate_event_loop()`:
1. When `enable_inspector` is true, create the runtime with `enable_inspector: true`
2. After runtime creation, get the session sender: `let sender = runtime.inner_mut().inspector().borrow().get_session_sender();`
3. If `session_sender_tx` is provided, publish the sender: `session_sender_tx.send(Some(sender))`
4. Continue with module loading as before

Thread the new options through `PersistentIsolate::new()` → `isolate_event_loop()`.

**In `http.rs` / `start_server_with_lifecycle()`:**

After `build_router()`, if `config.inspect`:
1. Create the watch channel: `let (session_sender_tx, session_sender_rx) = tokio::sync::watch::channel(None);`
2. Add `enable_inspector: true` and `session_sender_tx: Some(Arc::new(session_sender_tx))` to `PersistentIsolateOptions`
3. Create `InspectorServer::new(config.inspect_port, actual_port, session_sender_rx)`
4. Spawn the inspector server: `let ws_url = inspector_server.start().await?;`
5. Create `InspectorInfo { ws_url, inspect_brk: config.inspect_brk }`
6. Pass it to `print_banner_with_upstream()`

Note: The `PersistentIsolateOptions` changes mean we need to update the existing path in `build_router()` where options are constructed. Add `enable_inspector: false` and `session_sender_tx: None` as defaults when inspector is disabled.

**Acceptance criteria:**
- [ ] `vtz dev --inspect` starts both dev server and inspector server
- [ ] Inspector server binds to configured port (default 9229)
- [ ] Inspector session sender is published via watch channel after isolate creation
- [ ] WebSocket CDP connection works end-to-end (DevTools → WS → proxy → V8 → response)
- [ ] `Runtime.enable` and `Debugger.enable` return valid responses
- [ ] `Debugger.setBreakpointByUrl` sets a breakpoint
- [ ] Triggering SSR render hits the breakpoint → `Debugger.paused` event received
- [ ] `Debugger.resume` resumes execution
- [ ] Dev server without `--inspect` is unchanged (no regression)

---

### Task 5: Source map verification + CORS

**Files:** (3)
- `native/vtz/src/server/http.rs` (modified — CORS for `.map` paths)
- `native/vtz/tests/inspector_source_maps.rs` (new)
- `native/vtz/src/server/module_server.rs` (modified — CORS headers on source responses, if needed)

**What to implement:**

Verify that Chrome DevTools can fetch source maps cross-port. The `Debugger.scriptParsed` events from V8 include `sourceMapURL`. The Vertz compiler sets inline source map references (`//# sourceMappingURL=...`). Verify the URL format and ensure the dev server serves `.map` files with `Access-Control-Allow-Origin: *`.

1. Check if the dev server's CORS layer already applies to `/src/**` responses. If not, add `Access-Control-Allow-Origin: *` to source file and `.map` responses.
2. Write integration tests that:
   - Connect a CDP client via WebSocket
   - Send `Debugger.enable`
   - Trigger module loading (SSR render)
   - Capture `Debugger.scriptParsed` notifications
   - Verify `sourceMapURL` is present and is an absolute URL pointing to the dev server
   - HTTP GET the `sourceMapURL` — verify it returns valid JSON with `"sources"` array
   - Verify the CORS header is present on the response

**Acceptance criteria:**
- [ ] `Debugger.scriptParsed` events include `sourceMapURL` for compiled files
- [ ] `sourceMapURL` points to `http://localhost:<dev-port>/src/...`
- [ ] HTTP GET on `sourceMapURL` returns valid source map JSON
- [ ] Source map response includes `Access-Control-Allow-Origin: *` header
- [ ] Source map's `sources` array references the original `.tsx` file
