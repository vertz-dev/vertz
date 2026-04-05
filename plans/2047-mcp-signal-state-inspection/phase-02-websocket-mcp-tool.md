# Phase 2: Bidirectional WebSocket + MCP Tool

## Context

This phase wires up the full request/response flow: MCP tool handler → HMR WebSocket → browser state inspector → response back to MCP. It adds the `vertz_get_state` tool to the MCP server, extends the HMR WebSocket to handle client → server messages, and injects `state-inspector.ts` into the browser during dev mode.

Design doc: `plans/2047-mcp-signal-state-inspection.md`
Phase 1: `plans/2047-mcp-signal-state-inspection/phase-01-client-side-collection.md`

---

## Task 1: Extend HMR protocol with `InspectState` and `ClientMessage`

**Files:**
- `native/vtz/src/hmr/protocol.rs` (modified)
- `native/vtz/src/hmr/client_message.rs` (new)
- `native/vtz/src/hmr/mod.rs` (modified — add `pub mod client_message;`)

**What to implement:**

Add `InspectState` variant to the existing `HmrMessage` enum in `protocol.rs`:

```rust
/// Request component state inspection from connected browser.
#[serde(rename = "inspect-state")]
InspectState {
    #[serde(rename = "requestId")]
    request_id: String,
    /// Optional component function name filter (case-sensitive).
    filter: Option<String>,
},
```

Create `client_message.rs` with the `ClientMessage` enum for client → server messages:

```rust
use serde::Deserialize;

/// Messages sent from the browser to the server via HMR WebSocket.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    /// State inspection snapshot response from the browser.
    #[serde(rename = "state-snapshot")]
    StateSnapshot {
        #[serde(rename = "requestId")]
        request_id: String,
        snapshot: serde_json::Value,
    },
}
```

Update `mod.rs` to export the new module.

**Acceptance criteria:**
- [ ] `InspectState` serializes to `{"type":"inspect-state","requestId":"...","filter":"..."}`
- [ ] `InspectState` with `filter: None` omits the filter field (or includes it as null)
- [ ] `ClientMessage::StateSnapshot` deserializes from `{"type":"state-snapshot","requestId":"...","snapshot":{...}}`
- [ ] Existing HMR message tests still pass
- [ ] New unit tests for `InspectState` serialization roundtrip
- [ ] New unit tests for `ClientMessage` deserialization

---

## Task 2: Add `pending_inspections` to `DevServerState` and make WebSocket bidirectional

**Files:**
- `native/vtz/src/server/module_server.rs` (modified — add field to `DevServerState`)
- `native/vtz/src/hmr/websocket.rs` (modified — parse incoming messages, route state snapshots)

**What to implement:**

Add to `DevServerState` (in `module_server.rs`):

```rust
/// Pending state inspection requests awaiting browser response.
/// Key: requestId (UUID string), Value: oneshot sender for the snapshot.
pub pending_inspections: Arc<tokio::sync::Mutex<
    std::collections::HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>
>>,
```

Initialize as `Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()))` where `DevServerState` is constructed.

Modify `HmrHub::handle_connection` to accept `pending_inspections` and parse incoming messages:

```rust
pub async fn handle_connection(
    &self,
    socket: WebSocket,
    pending_inspections: Arc<tokio::sync::Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
) {
    // ... existing setup ...

    // Read task: parse incoming messages instead of ignoring them
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Close(_)) => break,
            Ok(Message::Text(text)) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    match client_msg {
                        ClientMessage::StateSnapshot { request_id, snapshot } => {
                            let mut pending = pending_inspections.lock().await;
                            if let Some(sender) = pending.remove(&request_id) {
                                let _ = sender.send(snapshot);
                            }
                        }
                    }
                }
                // Silently ignore unparseable messages (forwards compatibility)
            }
            Err(_) => break,
            _ => {}
        }
    }
    // ... existing cleanup ...
}
```

Update the call site in `http.rs` (where `handle_connection` is called) to pass `pending_inspections` from `DevServerState`.

**Acceptance criteria:**
- [ ] `DevServerState` has `pending_inspections` field, initialized empty
- [ ] `handle_connection` parses `ClientMessage::StateSnapshot` from incoming WebSocket text
- [ ] Parsed snapshot is routed to the correct oneshot sender via `request_id` lookup
- [ ] Sender is `.remove()`-ed from map (consumed, preventing leaks)
- [ ] Unparseable messages are silently ignored (no crash)
- [ ] Existing WebSocket tests still pass
- [ ] New tests: message parsing, oneshot routing, unknown message tolerance

---

## Task 3: Add `vertz_get_state` MCP tool handler

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — add tool definition + handler)

**What to implement:**

Add tool to `tool_definitions()` (after `vertz_get_api_spec`):

```rust
{
    "name": "vertz_get_state",
    "description": "Get the reactive state (signals, query states) of mounted component instances. Use this to debug why a component shows incorrect data or behaves unexpectedly. For visual layout issues, use vertz_render_page instead.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "component": {
                "type": "string",
                "description": "Component function name to filter by (case-sensitive, e.g. 'TaskCard'). Omit to get all mounted components."
            }
        },
        "required": []
    }
}
```

Add handler in `execute_tool()` match:

```rust
"vertz_get_state" => {
    let filter = args.get("component").and_then(|v| v.as_str()).map(|s| s.to_string());

    // Fail fast if no browser is connected
    let client_count = state.hmr_hub.client_count().await;
    if client_count == 0 {
        return Ok(serde_json::json!({
            "content": [{ "type": "text", "text": "No browser clients connected to the HMR WebSocket. Open the app in a browser first." }],
            "isError": true
        }));
    }

    // Generate request ID and register oneshot
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut pending = state.pending_inspections.lock().await;
        pending.insert(request_id.clone(), tx);
    }

    // Broadcast inspect-state command to all connected browsers
    state.hmr_hub.broadcast(HmrMessage::InspectState {
        request_id: request_id.clone(),
        filter,
    }).await;

    // Wait for response with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(5), rx).await {
        Ok(Ok(snapshot)) => {
            let text = serde_json::to_string_pretty(&snapshot).unwrap_or_default();
            state.console_log.push(
                LogLevel::Info,
                format!("MCP get_state: {} components", snapshot.get("totalInstances").and_then(|v| v.as_u64()).unwrap_or(0)),
                Some("mcp"),
            );
            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }]
            }))
        }
        Ok(Err(_)) => {
            // Oneshot sender dropped (browser disconnected)
            Err("Browser disconnected before sending state snapshot.".to_string())
        }
        Err(_) => {
            // Timeout — clean up pending entry
            let mut pending = state.pending_inspections.lock().await;
            pending.remove(&request_id);
            Err("State inspection timed out after 5 seconds. The browser may be unresponsive or the state-inspector script is not loaded.".to_string())
        }
    }
}
```

Add `uuid` dependency to `native/vtz/Cargo.toml` if not already present (use `uuid = { version = "1", features = ["v4"] }`).

**Acceptance criteria:**
- [ ] `vertz_get_state` appears in `tools/list` response
- [ ] Returns `isError: true` when no browser is connected
- [ ] Broadcasts `InspectState` message via HMR WebSocket
- [ ] Waits for response via oneshot channel
- [ ] Returns formatted snapshot JSON on success
- [ ] Returns error on 5s timeout with cleanup of pending entry
- [ ] Returns error when browser disconnects mid-inspection
- [ ] Console logs inspection results
- [ ] Existing MCP tests still pass

---

## Task 4: Inject `state-inspector.ts` in the Bun plugin + WebSocket listener

**Files:**
- `packages/ui-server/src/bun-plugin/state-inspector.ts` (modified — add WebSocket message handler)
- `packages/ui-server/src/bun-plugin/plugin.ts` (modified — inject state-inspector alongside fast-refresh-runtime)

**What to implement:**

Add a WebSocket message handler to `state-inspector.ts` that listens for `inspect-state` commands on the HMR WebSocket and responds with state snapshots:

```typescript
// Self-accept HMR to prevent chain reload (same pattern as fast-refresh-runtime)
if (import.meta.hot) import.meta.hot.accept();

// Listen for inspect-state commands on the HMR WebSocket
function setupInspector(): void {
  // The HMR WebSocket is created by Bun's dev client. Access it via the
  // __vertz_hmr_ws global set by the HMR shell, or fall back to creating
  // a new connection if the global isn't available.
  const ws = (globalThis as Record<string, WebSocket>).__vertz_hmr_ws;
  if (!ws) return;

  const originalOnMessage = ws.onmessage;
  ws.onmessage = (event: MessageEvent) => {
    // Call original handler first (HMR processing)
    if (originalOnMessage) originalOnMessage.call(ws, event);

    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
      if (msg.type === 'inspect-state') {
        const snapshot = collectStateSnapshot(msg.filter ?? undefined);
        ws.send(JSON.stringify({
          type: 'state-snapshot',
          requestId: msg.requestId,
          snapshot,
        }));
      }
    } catch {
      // Ignore parse errors — not all messages are for us
    }
  };
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupInspector);
  } else {
    setupInspector();
  }
}
```

In `plugin.ts`, inject `state-inspector.ts` alongside `fast-refresh-runtime.ts`. The exact injection mechanism depends on how Fast Refresh is currently injected — follow the same pattern (either as an import prepended to the entry module, or as a side-effect module loaded in the HMR shell).

**Acceptance criteria:**
- [ ] `state-inspector.ts` is injected into the browser in dev mode
- [ ] Listens for `inspect-state` messages on the HMR WebSocket
- [ ] Calls `collectStateSnapshot()` with the provided filter
- [ ] Sends `state-snapshot` response back via WebSocket with matching `requestId`
- [ ] Does NOT break existing HMR message handling (original handler still called)
- [ ] Zero overhead when no inspection is requested (no polling, no timers)
- [ ] Self-accepts HMR to prevent chain reloads

---

## Task 5: E2E integration test

**Files:**
- `packages/ui-server/src/__tests__/state-inspector-e2e.local.ts` (new)

**What to implement:**

End-to-end test using a real dev server + browser (Playwright). This is a `.local.ts` file (not run in CI, per integration test safety rules).

Test scenarios:
1. Start dev server with example app mounting components with signals and queries
2. Open browser page
3. Call MCP tool via HTTP POST to `/__vertz_mcp` (JSON-RPC)
4. Verify response contains component snapshots with signal values
5. Verify query grouping works
6. Verify filter by component name
7. Verify "no instances" message for unmounted component
8. Verify "no browser" error when no client is connected

**Acceptance criteria:**
- [ ] Full roundtrip: MCP call → WebSocket → browser → WebSocket → MCP response
- [ ] Signal values are plain JSON
- [ ] Query signals grouped correctly
- [ ] Filter works
- [ ] Error cases handled
- [ ] Uses `.local.ts` extension (not `.test.ts`)
- [ ] All async resources cleaned up in afterEach (WebSocket, server)
- [ ] Timeouts on all Promise-based waits

---

## Testing Notes

### Rust tests
- Protocol tests: unit tests in `protocol.rs` (existing pattern — add `InspectState` roundtrip)
- Client message tests: unit tests in `client_message.rs`
- WebSocket routing: extract `parse_client_message()` as pure function, test in isolation
- MCP tool: test within existing MCP test infrastructure (mock state)

### TypeScript tests
- WebSocket handler: mock WebSocket in unit tests
- E2E: `.local.ts` with Playwright + real dev server

### Running quality gates
```bash
# TypeScript
vtz test && vtz run typecheck && vtz run lint

# Rust
cd native && cargo test --all && cargo clippy --all-targets --release -- -D warnings && cargo fmt --all -- --check
```
