# Phase 2: `--inspect-brk` + Isolate Restart Resilience

## Context

Phase 1 delivered working breakpoint debugging via `--inspect`. This phase adds two features: (1) `--inspect-brk` pauses execution before the entry module loads, and (2) the inspector survives isolate restarts triggered by file changes.

Design doc: `plans/2044-cdp-inspect.md` (Rev 3)
Depends on: Phase 1 (CLI flags, InspectorServer, WebSocket bridge, banner, source maps)

## Tasks

### Task 1: `--inspect-brk` — pause before module load

**Files:** (4)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified)
- `native/vtz/src/server/http.rs` (modified)
- `native/vtz/src/server/module_server.rs` (modified — `DevServerState` gains `inspector_paused` field)
- `native/vtz/tests/inspector_brk.rs` (new)

**What to implement:**

**In `PersistentIsolateOptions`:**

Add a new field:

```rust
/// Whether to pause V8 at the first statement of the entry module (--inspect-brk).
pub inspect_brk: bool,
```

**In `isolate_event_loop()`:**

After creating the runtime with `enable_inspector: true` and publishing the session sender via `session_sender_tx`, but **before** `load_main_module()`:

```rust
if inspect_brk {
    eprintln!("[Server] Waiting for debugger to attach...");
    // This parks the V8 thread until a debugger connects via the session sender channel.
    // InspectorWaker unparks the thread when InspectorSessionProxy arrives.
    // After the session is established, break_on_next_statement() schedules a V8 pause.
    runtime.inner_mut().inspector().borrow_mut().wait_for_session_and_break_on_next_statement();
    eprintln!("[Server] Debugger attached, continuing...");
}
// Now load modules — V8 will hit the scheduled pause at the first statement
```

**Thread the new options:** Pass `inspect_brk` through `PersistentIsolate::new()` → `isolate_event_loop()` arguments. Add it to the data that flows to the spawned thread.

**In `DevServerState` (module_server.rs):**

Add a field for the HTTP layer to know the inspector is paused:

```rust
/// Whether the inspector is in --inspect-brk waiting state.
/// Set to true before wait_for_session, cleared after debugger attaches.
/// Used by the HTML shell to show a "waiting for debugger" message.
pub inspector_paused: Arc<std::sync::atomic::AtomicBool>,
```

**In `http.rs`:**

Set `inspector_paused` to `true` before creating the `PersistentIsolate` when `config.inspect_brk` is true. The isolate thread will set it to `false` after the debugger attaches (via a shared `Arc<AtomicBool>`).

When `inspector_paused` is true and a page request arrives, the `is_initialized()` check already returns `false` (the isolate hasn't loaded modules yet), so the HTML shell fallback is used. Optionally inject a `<script>` in the HTML shell that displays: "Dev server is paused — waiting for debugger at ws://127.0.0.1:{port}/...".

**In `banner.rs`:**

The `InspectorInfo.inspect_brk` field was already added in Phase 1 Task 3 and the banner already prints the "Paused: Waiting for debugger to attach..." line.

**Acceptance criteria:**
- [ ] `vtz dev --inspect-brk` parks the V8 thread before loading modules
- [ ] Banner shows "Paused: Waiting for debugger to attach..."
- [ ] HTTP requests return client-only HTML while paused (SSR not available)
- [ ] Connecting a CDP client and sending `Runtime.runIfWaitingForDebugger` (or `Debugger.resume`) resumes execution
- [ ] After debugger attaches, SSR initializes and pages render normally
- [ ] `inspector_paused` flag transitions: `true` → `false` after attach
- [ ] Integration test: start with `--inspect-brk`, verify SSR unavailable, connect debugger, verify SSR works

---

### Task 2: Inspector survives isolate restarts

**Files:** (4)
- `native/vtz/src/server/inspector.rs` (modified)
- `native/vtz/src/server/http.rs` (modified — isolate restart publishes new sender)
- `native/vtz/src/runtime/persistent_isolate.rs` (modified — pass `session_sender_tx` to restart path)
- `native/vtz/tests/inspector_restart.rs` (new)

**What to implement:**

**In `inspector.rs`:**

The `InspectorServer` already holds a `watch::Receiver<Option<UnboundedSender<InspectorSessionProxy>>>`. When the value changes (new isolate created), the bridge task needs to:

1. Detect the watch channel value changed (the sender is now a different `UnboundedSender`)
2. Close the current WebSocket connection (send close frame)
3. The old `InspectorSessionProxy` channels are dropped when the old isolate is dropped
4. Wait for the debugger to reconnect (Chrome auto-reconnects, VS Code with `restart: true` auto-reconnects)
5. Create a new `InspectorSessionProxy` with the new sender

Add a `changed()` watch on the session sender inside the bridge task's main loop. Use `tokio::select!` to race WebSocket messages against watch changes.

**In `http.rs` — isolate restart path:**

The file watcher restart logic (around line 1382) creates a new `PersistentIsolate::new(opts)`. The `opts` must include `session_sender_tx` so the new isolate publishes its session sender to the same watch channel. Ensure the `PersistentIsolateOptions` clone preserves the `session_sender_tx` Arc.

Currently the watcher restart code does:
```rust
let opts = guard.as_ref().map(|iso| iso.options().clone());
```

Since `session_sender_tx` is an `Option<Arc<watch::Sender<...>>>`, and `Arc` implements `Clone`, this already works — the cloned options share the same watch sender. Verify this path works.

**In `persistent_isolate.rs`:**

Ensure that when the old isolate is dropped, its `JsRuntimeInspector` dropping sends `None` or the deregister handler fires, so the `InspectorServer` knows the old session is gone. The `add_deregister_handler()` mechanism in deno_core fires a oneshot when the inspector drops. We can optionally use this for cleanup, but the primary mechanism is the watch channel publishing a new sender.

**Known limitation:** Breakpoints are lost on restart. The debugger must re-set breakpoints after reconnecting. This matches Node.js `--watch` + `--inspect` behavior. Document in the design.

**Acceptance criteria:**
- [ ] File change triggers isolate restart → new session sender published via watch channel
- [ ] Inspector server detects the change and closes the current WebSocket
- [ ] Debugger client (Chrome/VS Code) reconnects automatically
- [ ] After reconnect, `Debugger.enable` and `setBreakpointByUrl` work with the new isolate
- [ ] No memory leak: old isolate's channels are dropped cleanly
- [ ] Known limitation documented: breakpoints lost on restart
- [ ] Integration test: connect debugger → trigger file change → verify reconnect → verify debugging works

---

### Task 3: VS Code launch.json verification

**Files:** (2)
- `native/vtz/tests/inspector_vscode_compat.rs` (new)
- Plans doc updated with verification results (if corrections needed)

**What to implement:**

Write an integration test that simulates VS Code's debugger attachment pattern:
1. Start `vtz dev --inspect`
2. Connect via raw WebSocket (VS Code uses `type: "node"` which speaks CDP)
3. Send the same CDP message sequence VS Code sends on attach:
   - `Runtime.enable`
   - `Debugger.enable`
   - `Debugger.setAsyncCallStackDepth { maxDepth: 32 }`
   - `Debugger.setBreakpointsActive { active: true }`
4. Verify all messages return successful responses
5. Set a breakpoint and verify it triggers during SSR

Also verify the `restart` reconnection: simulate the WebSocket being closed (as happens on isolate restart), then reconnect and re-send the initialization sequence.

If the VS Code compatibility test reveals issues (e.g., unexpected CDP methods, source map path mismatches), update the design doc with corrections and fix the implementation.

**Acceptance criteria:**
- [ ] VS Code's CDP initialization sequence works (all messages return success)
- [ ] Breakpoints work through the VS Code-style flow
- [ ] Reconnection after WebSocket close works (simulates `restart: true`)
- [ ] `launch.json` example in design doc verified or corrected
