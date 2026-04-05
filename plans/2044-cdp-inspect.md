# Design: Chrome DevTools Protocol (`--inspect`)

**Issue:** #2044
**Status:** Draft (Rev 3 — addressing re-review findings)
**Date:** 2026-04-05

## Summary

Add V8 Inspector Protocol support to the Vertz runtime so developers can attach Chrome DevTools or VS Code debugger to the dev server's V8 Isolate. This adds `--inspect`, `--inspect-brk`, and `--inspect-port` CLI flags, opens a WebSocket on `127.0.0.1:9229` speaking CDP, and connects the V8 inspector agent from `deno_core`'s `JsRuntime`.

## API Surface

### CLI Flags

```bash
# Start dev server with inspector enabled (default port 9229)
vtz dev --inspect

# Start dev server with inspector, pause at first line of entry module
vtz dev --inspect-brk

# Use a custom inspector port (implies --inspect)
vtz dev --inspect-port 9230

# Combine with existing flags
vtz dev --inspect --port 4000 --open
```

**Flag semantics:**
- `--inspect` — Enables the inspector. Passing both `--inspect` and `--inspect-brk` is a user error since `--inspect-brk` already implies `--inspect`.
- `--inspect-brk` — Enables the inspector AND pauses before the entry module evaluates. Implies `--inspect`.
- `--inspect-port <port>` — Sets the inspector port. **Implies `--inspect`** — passing `--inspect-port` without `--inspect` is equivalent to `--inspect --inspect-port <port>`, not a no-op.

### Banner Output

When `--inspect` or `--inspect-brk` is passed, the banner displays an additional `Debugger:` line with a hint for Chrome users:

```
  ▲ Vertz v0.1.0-dev

  Local:     http://localhost:3000
  Network:   http://192.168.1.42:3000
  MCP:       http://localhost:3000/__vertz_mcp
  Debugger:  ws://127.0.0.1:9229/<uuid>
             Open chrome://inspect to attach

  Ready in 142ms

  Shortcuts:
  r restart  o open  c clear  q quit
```

When `--inspect-brk` is used, the banner additionally prints:

```
  Debugger:  ws://127.0.0.1:9229/<uuid>
             Open chrome://inspect to attach
  Paused:    Waiting for debugger to attach...
```

### VS Code launch.json

Developers can attach VS Code's debugger using the built-in Node.js debugger (which speaks CDP):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Vertz",
      "port": 9229,
      "address": "127.0.0.1",
      "restart": true,
      "sourceMaps": true,
      "sourceMapPathOverrides": {
        "*": "${workspaceFolder}/*"
      },
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

The `"type": "node"` debugger in VS Code uses CDP and connects to any CDP-compliant WebSocket server. The `restart: true` flag handles reconnection when the isolate restarts on file changes. This is the same pattern developers use with `node --inspect --watch`. To be verified during Phase 1 and documented as-is or with corrections in Phase 3.

### HTTP Metadata Endpoints

Per the CDP specification, the inspector server exposes HTTP metadata endpoints on the inspector port:

`GET http://127.0.0.1:9229/json/version` returns:

```json
{
  "Browser": "Vertz/0.1.0-dev (deno_core/0.311.0)",
  "Protocol-Version": "1.3",
  "V8-Version": "<v8-version>",
  "webSocketDebuggerUrl": "ws://127.0.0.1:9229/<uuid>"
}
```

`GET http://127.0.0.1:9229/json` or `/json/list` returns the target list:

```json
[
  {
    "description": "Vertz dev server",
    "devtoolsFrontendUrl": "chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=127.0.0.1:9229/<uuid>",
    "id": "<uuid>",
    "title": "Vertz Inspector",
    "type": "node",
    "webSocketDebuggerUrl": "ws://127.0.0.1:9229/<uuid>"
  }
]
```

These endpoints enable `chrome://inspect` autodiscovery and VS Code's `Attach to Process` feature.

## Architecture

### Component Diagram

```
┌─────────────────────────────┐
│ Chrome DevTools / VS Code   │
└──────────┬──────────────────┘
           │ CDP JSON over WebSocket
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  InspectorServer (new)                     127.0.0.1:9229       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ HTTP metadata │  │ WS upgrade   │  │ Bridge task (tokio)   │ │
│  │ /json/version │  │ → WS conn    │  │ WS ↔ channel shuttle │ │
│  └──────────────┘  └──────┬───────┘  └───────────┬───────────┘ │
│                           │ Creates               │             │
│                           ▼                       │             │
│  ┌───────────────────────────────────────────┐    │             │
│  │ InspectorSessionProxy (deno_core)         │    │             │
│  │ tx: UnboundedSender<InspectorMsg>  ◄──────┘    │             │
│  │ rx: UnboundedReceiver<String>      ────────────┘             │
│  └────────────────────┬──────────────────────┘                  │
└───────────────────────┼─────────────────────────────────────────┘
                        │ Channels (cross-thread)
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  PersistentIsolate (existing)           [dedicated OS thread]   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  VertzJsRuntime → JsRuntime                                │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  JsRuntimeInspector (deno_core)                      │  │ │
│  │  │  - new_session_tx → receives InspectorSessionProxy   │  │ │
│  │  │  - poll_sessions() processes CDP messages            │  │ │
│  │  │  - V8Inspector dispatches to V8 engine               │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Cross-Thread Message Flow (Sequence)

```
WebSocket Client          Bridge Task (tokio)          V8 Thread (isolate)
     │                         │                            │
     │── WS connect ──────────>│                            │
     │                         │── create InspectorSession  │
     │                         │   Proxy (tx+rx channels)   │
     │                         │── send proxy via ──────────>│ new_session_tx
     │                         │   get_session_sender()     │
     │                         │                            │── InspectorWaker
     │                         │                            │   unparks thread
     │                         │                            │
     │── CDP request ─────────>│                            │
     │   (JSON string)         │── forward via ─────────────>│ proxy.rx
     │                         │                            │── V8Inspector
     │                         │                            │   dispatches
     │                         │<── response via ───────────│ proxy.tx
     │<── CDP response ────────│   InspectorMsg             │
     │   (JSON string)         │                            │
```

### Key Design Decisions

**1. Separate TCP listener for inspector (not shared with dev server)**

The inspector runs on its own port (default `9229`, matching Node.js convention). This keeps the inspector independent of the dev server lifecycle — if the dev server restarts on a different port, the debugger connection persists.

**2. Inspector attaches to the PersistentIsolate, not ephemeral test isolates**

The dev server's `PersistentIsolate` is the long-lived V8 runtime that handles SSR and API routes. This is what developers want to debug. The inspector connects to this isolate's `JsRuntime`.

**3. Single debugger session at a time**

Only one debugger client can connect at a time (same as Node.js `--inspect`). If a second client connects, the first is disconnected. This simplifies session management.

**4. `--inspect-brk` pauses BEFORE first module evaluation**

When `--inspect-brk` is used, the isolate thread calls `inspector.borrow_mut().wait_for_session_and_break_on_next_statement()` **before** `load_main_module()`. This ensures the pause happens at the very first line of the entry module, not after it has already evaluated. The call order is:

1. Create `JsRuntime` with `inspector: true`
2. Get `session_sender` via `inspector.borrow().get_session_sender()` — this returns an `UnboundedSender<InspectorSessionProxy>` which is `Send` and can be passed to the tokio-side `InspectorServer`. Note: only the sender crosses thread boundaries, not the `Rc<RefCell<JsRuntimeInspector>>`
3. Call `inspector.borrow_mut().wait_for_session_and_break_on_next_statement()` — this parks the V8 thread (via `poll_sessions()` → `PollState::Parked → thread::park()`) until a session is established
4. When the `InspectorServer` bridge task sends an `InspectorSessionProxy` via the `new_session_tx` channel, this triggers the `InspectorWaker` which calls `thread::unpark()`, waking the V8 thread
5. The thread wakes, `poll_sessions()` establishes the session, `break_on_next_statement()` is called (scheduling `schedule_pause_on_next_statement()` in V8), and the method returns
6. Now call `load_main_module()` — V8 hits the scheduled pause at the first statement and sends `Debugger.paused` to the client
7. When the debugger client sends `Debugger.resume` (or `Runtime.runIfWaitingForDebugger` for the initial pause), V8 clears the pause and resumes execution. Note: `run_if_waiting_for_debugger()` clears the `waiting_for_session` flag — it does NOT unpark the thread (the thread was already unparked in step 4)

**5. Source maps: absolute URLs pointing to the dev server**

`Debugger.scriptParsed` events include `sourceMapURL` set to `http://localhost:<dev-port>/src/file.tsx.map`. Chrome DevTools fetches source maps from this URL. The dev server must ensure `Access-Control-Allow-Origin: *` is set for source map responses (`.map` files and `/src/**` paths) so cross-origin fetches from `chrome-devtools://` succeed. The existing `tower-http` CORS layer needs to be verified/configured for this. If CORS is not already globally applied, we add it for source-map-related paths.

**6. HTTP behavior during `--inspect-brk` pause**

While the isolate is paused waiting for a debugger to attach, the Rust HTTP server (axum) is still running. Incoming HTTP requests for SSR/API will reach the `PersistentIsolate` channel but the isolate thread is parked. The existing `is_initialized()` check on `PersistentIsolate` returns `false` during this period, so the HTTP layer falls back to the client-only HTML shell.

To give the developer a clear signal, the `DevServerState` gains an `inspector_paused: Arc<AtomicBool>` field, set to `true` before the isolate thread calls `wait_for_session_and_break_on_next_statement()`, and set to `false` once the method returns (session connected). The HTML shell generator checks this flag and injects a `<script>` tag that displays an inline message: "Dev server is paused — waiting for debugger at ws://127.0.0.1:9229/...". This avoids relying on HTTP headers that client-side JS cannot read after page load.

**7. Inspector survives isolate restarts — deferred to Phase 3**

When the file watcher triggers an isolate restart, the old isolate's `JsRuntimeInspector` is dropped. The `InspectorServer` must swap to the new isolate's session sender. The mechanism:

- `InspectorServer` holds an `Arc<tokio::sync::watch::Sender<Option<UnboundedSender<InspectorSessionProxy>>>>` — a watch channel containing the current session sender
- When `PersistentIsolate::new()` creates a new isolate, it calls `inspector.borrow().get_session_sender()` and publishes it through the watch channel
- The `InspectorServer` subscribes to the watch receiver. When the sender changes, it disconnects the existing WebSocket session (if any) and waits for the debugger to reconnect
- The debugger client sees the WebSocket close and reconnects (Chrome DevTools auto-reconnects; VS Code with `restart: true` auto-reconnects)

This is a best-effort mechanism — breakpoints are lost on restart (same as Node.js `--watch` + `--inspect`). Documented as a known limitation.

### Integration with Existing Components

**`cli.rs`** — Three new fields on `DevArgs`:
- `--inspect` (bool flag)
- `--inspect-brk` (bool flag, `conflicts_with = "inspect"`) — implies `--inspect`
- `--inspect-port` (u16, default 9229) — implies `--inspect`

**`config.rs`** — Three new fields on `ServerConfig`:
- `inspect: bool` — true if any of the three flags are passed
- `inspect_brk: bool`
- `inspect_port: u16`

**`main.rs` / `build_dev_config()`** — Resolves flag implications: `config.inspect = args.inspect || args.inspect_brk || args.inspect_port.is_some()`. Pipes to `ServerConfig`.

**`persistent_isolate.rs`** — `PersistentIsolateOptions` gains:
- `enable_inspector: bool` — Passed through to `VertzRuntimeOptions::enable_inspector`
- `inspect_brk: bool` — When true, calls `wait_for_session_and_break_on_next_statement()` **before** `load_main_module()`
- `session_sender_tx: Option<Arc<watch::Sender<Option<UnboundedSender<InspectorSessionProxy>>>>>` — Publishes the inspector session sender after isolate creation

**`banner.rs`** — `print_banner_with_upstream()` gains an optional `inspector_info: Option<InspectorInfo>` parameter (containing `ws_url`, `inspect_brk` flag) to print the `Debugger:` and optional `Paused:` lines.

**`http.rs` / `start_server_with_lifecycle()`** — After binding the dev server, if `config.inspect`:
1. Create the `watch::channel` for the session sender
2. Start the `InspectorServer` on `config.inspect_port`
3. Pass the watch sender to `PersistentIsolateOptions`
4. Print the debugger URL in the banner

## Manifesto Alignment

### Principle 3: AI agents are first-class users
The `--inspect` flag is discoverable and follows Node.js conventions that LLMs already know. An LLM can correctly suggest `vtz dev --inspect` on the first prompt because the pattern is identical to `node --inspect`.

### Principle 5: If you can't test it, don't build it
Each component (CLI parsing, inspector server, CDP metadata, session management) is independently testable. Integration tests verify end-to-end debugger attachment via automated CDP clients (not manual browser testing).

### Principle 7: Performance is not optional
The inspector has zero overhead when disabled (the default). When enabled but no debugger connected, the only cost is the TCP listener and a parked session poller — negligible.

### Principle 8: No ceilings
This removes a DX regression vs Bun's built-in `--inspect`. Developers who rely on breakpoint debugging are no longer forced to choose between the Vertz runtime's features and their debugging workflow.

### Tradeoffs
- **Convention over configuration** — We use port 9229 (Node.js convention) as default. One obvious way.
- **Explicit over implicit** — Inspector is opt-in via a flag, not always-on. No hidden performance cost.

### What was rejected
- **Always-on inspector** — Rejected because it opens a network port by default, which is a security concern and adds (minimal) overhead.
- **Sharing the dev server port** — Rejected because the inspector must survive dev server restarts and port changes.
- **Multiple concurrent debugger sessions** — Rejected for simplicity. Node.js also limits to one session.

## Non-Goals

1. **Remote debugging** — The inspector binds to `127.0.0.1` only. No `--inspect=0.0.0.0:9229` for remote access. Security concern; not needed for local dev.
2. **Profiling UI integration** — While CDP supports profiling, we don't add any profiling-specific DX (flame charts, heap snapshots). Chrome DevTools handles this natively.
3. **Test runner debugging** — `vtz test --inspect` is out of scope for this feature. The test runner uses ephemeral isolates; attaching a debugger is a different problem.
4. **Multi-isolate debugging** — If the runtime evolves to use multiple V8 isolates (e.g., parallel SSR workers), debugging all of them simultaneously is out of scope. We debug the primary persistent isolate.
5. **Custom CDP domains** — We don't add Vertz-specific CDP domains (e.g., for signal inspection). That's a future feature.

## Unknowns

### 1. deno_core inspector API — RESOLVED

**Question:** Does `deno_core` 0.311.0 expose a ready-made `InspectorServer` that handles the WebSocket CDP server, or do we need to build it from scratch?

**Resolution:** Investigated the deno_core 0.311.0 source at `~/.cargo/registry/src/`. **No built-in `InspectorServer` exists.** deno_core provides only the V8 inspector binding and session multiplexing:

- `JsRuntimeInspector::get_session_sender()` → `UnboundedSender<InspectorSessionProxy>` — The entry point for registering remote sessions
- `InspectorSessionProxy` — A duplex channel struct:
  - `tx: UnboundedSender<InspectorMsg>` — V8 → client (responses/notifications)
  - `rx: UnboundedReceiver<String>` — client → V8 (CDP commands)
- `InspectorMsg { kind: InspectorMsgKind, content: String }` — Message envelope from V8
- `wait_for_session()` — Blocks V8 thread until a session connects via `new_session_tx`
- `wait_for_session_and_break_on_next_statement()` — Same + schedules a V8 pause
- `add_deregister_handler()` → `oneshot::Receiver<()>` — Fires when inspector drops (only one handler allowed)

**Implication:** We build a thin `InspectorServer` using axum (HTTP routes + WebSocket via `axum::extract::ws`) that bridges network connections to `InspectorSessionProxy` channels. We use axum (not raw `tokio-tungstenite`) for consistency with the dev server. The V8 protocol logic is handled entirely by deno_core. Our server is ~200-300 lines of transport plumbing.

### 2. `--inspect-brk` thread model — RESOLVED

**Question:** How does `--inspect-brk` block the V8 thread while waiting for a debugger?

**Resolution:** `wait_for_session_and_break_on_next_statement()` parks the V8 thread internally using `thread::park()` (via `poll_sessions()` → `PollState::Parked`). The `InspectorWaker` (implementing `task::ArcWake`) unparks the thread when a new session arrives through `new_session_tx`. No oneshot channel needed — V8's inspector state machine handles this internally:

1. V8 thread calls `wait_for_session_and_break_on_next_statement()` → parks
2. `InspectorServer` bridge task sends `InspectorSessionProxy` via `get_session_sender()`
3. The send triggers `InspectorWaker::wake_by_ref()` → calls `thread::unpark()` on the V8 thread
4. V8 thread wakes, inspector establishes the session, calls `break_on_next_statement()` (schedules `schedule_pause_on_next_statement()`)
5. Method returns, V8 thread proceeds to `load_main_module()` → V8 hits the scheduled pause

The thread is already running when `Runtime.runIfWaitingForDebugger` (or `Debugger.resume`) arrives from the client. The `run_if_waiting_for_debugger()` call just clears the `waiting_for_session` flag and does NOT unpark the thread — it was unparked in step 3. V8 then resumes execution normally.

### 3. Source map cross-port resolution — NEEDS VERIFICATION (Phase 1)

**Question:** Does Chrome DevTools correctly fetch source maps from port 3000 when the inspector is on port 9229?

**Resolution approach:** Chrome DevTools fetches source maps from the URL in `Debugger.scriptParsed.sourceMapURL`. We will set this to `http://localhost:<dev-port>/src/file.tsx.map` (absolute URL). Chrome DevTools makes these fetches from the DevTools application context (`chrome-devtools://`), which may be subject to CORS. The dev server already has `tower-http` with the `cors` feature. We verify during Phase 1 that `Access-Control-Allow-Origin: *` is applied to `.map` responses. If not, we add it. This is gated: Phase 2 source map work only starts once Phase 1 has verified the cross-port fetch works.

## POC Results

No prior POC. The existing inspector usage in `test/executor.rs` (coverage collection via `LocalInspectorSession`) proves that deno_core's inspector infrastructure is functional in our runtime. The API investigation (Unknown #1) confirms the exact types and mechanisms needed for remote WebSocket bridging.

## Type Flow Map

This feature is entirely in Rust (`native/vtz/`). There are no TypeScript generics or public TypeScript API changes. The "types" in play are:

```
CLI (clap) → DevArgs.inspect/inspect_brk/inspect_port
           → build_dev_config() resolves implications (inspect_port implies inspect)
           → ServerConfig.inspect/inspect_brk/inspect_port
           → start_server_with_lifecycle() creates InspectorServer + watch channel
           → PersistentIsolateOptions.enable_inspector/inspect_brk/session_sender_tx
           → VertzRuntimeOptions.enable_inspector = true (existing field)
           → JsRuntime(inspector: true) (deno_core)
           → JsRuntimeInspector.get_session_sender() → UnboundedSender<InspectorSessionProxy>
           → Published via watch::Sender to InspectorServer
           → InspectorServer bridges WebSocket ↔ InspectorSessionProxy channels
```

No TypeScript type tests (`.test-d.ts`) needed — no TypeScript API surface.

## E2E Acceptance Tests

All E2E tests are **automated** using a raw CDP WebSocket client (not a manual browser). Tests use `tokio-tungstenite` to connect to the inspector WebSocket, send CDP JSON commands, and verify responses/events programmatically.

### Test 1: `--inspect` starts CDP WebSocket and prints URL in banner

```
Given: A Vertz project with a simple app.tsx
When:  `vtz dev --inspect` is started
Then:  - Banner includes "Debugger: ws://127.0.0.1:9229/<uuid>"
       - Banner includes "Open chrome://inspect to attach"
       - GET http://127.0.0.1:9229/json/version returns valid JSON with webSocketDebuggerUrl
       - GET http://127.0.0.1:9229/json returns a target list with type "node"
       - WebSocket connection to ws://127.0.0.1:9229/<uuid> is accepted
       - Sending Runtime.enable via WebSocket returns a valid CDP response
```

### Test 2: Breakpoint debugging works (automated CDP client)

```
Given: A Vertz project with app.tsx containing: export function App() { const x = 1; return <div>{x}</div>; }
When:  `vtz dev --inspect` is started
And:   A raw CDP WebSocket client connects
And:   Client sends Debugger.enable
And:   Client sends Debugger.setBreakpointByUrl for app.tsx line 1
And:   An SSR render is triggered (GET http://localhost:3000/)
Then:  Client receives Debugger.paused event with correct source location
And:   Client sends Debugger.resume
And:   The page render completes successfully
```

### Test 3: `--inspect-brk` pauses at first line

```
Given: A Vertz project with app.tsx
When:  `vtz dev --inspect-brk` is started
Then:  Banner prints "Waiting for debugger to attach..."
And:   HTTP requests to the dev server return client-only HTML (SSR not initialized)
When:  A raw CDP WebSocket client connects and sends Runtime.runIfWaitingForDebugger
Then:  The isolate continues, SSR initializes, and subsequent pages render with SSR
```

### Test 4: `--inspect-port` configures the port (and implies --inspect)

```
Given: A Vertz project
When:  `vtz dev --inspect-port 9230` is started (no explicit --inspect)
Then:  Inspector listens on port 9230, not 9229
And:   Banner shows "Debugger: ws://127.0.0.1:9230/<uuid>"
And:   GET http://127.0.0.1:9230/json/version returns valid JSON
```

### Test 5: Source maps in Debugger.scriptParsed (automated CDP client)

```
Given: A Vertz project with app.tsx using JSX and reactive signals
When:  `vtz dev --inspect` is started
And:   A raw CDP WebSocket client connects and sends Debugger.enable
Then:  Debugger.scriptParsed events for compiled files include sourceMapURL
And:   The sourceMapURL is an absolute URL pointing to http://localhost:<dev-port>/src/...
And:   HTTP GET on the sourceMapURL returns a valid JSON source map
And:   The source map's "sources" array references the original .tsx file
```

## Implementation Phases

### Phase 1: Working Breakpoint Debugging (Vertical Slice)

**Goal:** `vtz dev --inspect` starts a CDP WebSocket server, prints the debugger URL, accepts debugger connections, and supports setting and hitting breakpoints during SSR renders. This is the thinnest end-to-end slice: a developer can connect Chrome DevTools, set a breakpoint, and hit it.

**Why source maps are in Phase 1 (not deferred):** Source map cross-port fetching depends on CORS configuration, which is Unknown #3. If source maps don't work cross-port, the architecture may need the inspector server to proxy source map requests — a significant design change. We verify this in Phase 1 to avoid discovering a blocking issue in a later phase. Additionally, breakpoint debugging without source maps is nearly unusable (breakpoints land on compiled output, not original `.tsx`), so source maps are part of the minimum viable DX.

**Acceptance criteria:**
- `--inspect`, `--inspect-brk`, `--inspect-port` flags parsed and piped to config
- `--inspect-port` implies `--inspect`; `--inspect-brk` implies `--inspect`
- `InspectorServer` starts on configured port with HTTP metadata endpoints (`/json/version`, `/json`)
- WebSocket upgrade at `/<uuid>` bridges CDP messages to V8 inspector via `InspectorSessionProxy`
- Banner displays `Debugger:` line with WebSocket URL and `chrome://inspect` hint
- `Debugger.enable`, `Debugger.setBreakpointByUrl`, `Debugger.paused`, `Debugger.resume` all work
- Source map cross-port fetch verified (CORS headers on dev server for `.map` paths)
- `Debugger.scriptParsed` events include correct `sourceMapURL`
- Unit tests: CLI parsing, banner formatting, metadata endpoint responses
- Integration tests: Tests 1, 2, 4, 5 from E2E acceptance tests above (automated CDP client)

### Phase 2: `--inspect-brk` + Isolate Restart Resilience

**Goal:** `--inspect-brk` pauses at first module evaluation. Inspector handles isolate restarts gracefully.

**Depends on:** Phase 1

**Acceptance criteria:**
- `--inspect-brk` calls `wait_for_session_and_break_on_next_statement()` BEFORE `load_main_module()`
- HTTP requests during pause return client-only HTML (no SSR) — `is_initialized()` stays false
- `Runtime.runIfWaitingForDebugger` resumes execution and SSR initializes
- Banner prints `Paused: Waiting for debugger to attach...` for `--inspect-brk`
- Isolate restart (file change) publishes new session sender via `watch::channel`
- `InspectorServer` detects sender change, disconnects old WebSocket, waits for reconnect
- Known limitation documented: breakpoints are lost on restart (same as Node.js)
- VS Code `launch.json` with `restart: true` verified to reconnect automatically
- Integration test: Test 3 from E2E acceptance tests above

### Phase 3: Documentation

**Goal:** Document the `--inspect` feature for developers.

**Depends on:** Phase 2

**Acceptance criteria:**
- `packages/mint-docs/` updated with `--inspect` usage guide
- Covers: basic usage, VS Code `launch.json` configuration, `--inspect-brk` workflow, known limitations (breakpoints lost on restart)
- Chrome DevTools workflow documented (via `chrome://inspect`)
- Troubleshooting section: port conflicts, inspector not connecting, source maps not resolving
