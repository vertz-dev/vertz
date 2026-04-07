# Phase 1: Browser Interaction Hub + list_tabs

## Context

This is the first phase of the MCP Browser Interaction Tools feature. It establishes the server-side infrastructure: a `BrowserInteractionHub` that manages per-tab WebSocket connections, and the browser-side client that connects to `/__vertz_interact` and identifies itself with a stable tab ID. The `vertz_browser_list_tabs` MCP tool is the first usable tool — it lets agents see which browser tabs are connected.

Design doc: `plans/mcp-browser-interaction.md`

## Tasks

### Task 1: BrowserInteractionHub struct

**Files:**
- `native/vtz/src/server/browser_hub.rs` (new)
- `native/vtz/src/server/mod.rs` (modified — add module declaration)

**What to implement:**

Create `BrowserInteractionHub` — a targeted-send hub (unlike HmrHub which is broadcast-only). It maintains:

- `tabs: Arc<RwLock<HashMap<String, TabInfo>>>` — maps tab ID to connection info
- `tab_senders: Arc<RwLock<HashMap<String, mpsc::Sender<String>>>>` — maps tab ID to WebSocket sender
- `sessions: Arc<RwLock<HashMap<String, String>>>` — maps session ID to tab ID
- `pending_requests: Arc<RwLock<HashMap<String, oneshot::Sender<serde_json::Value>>>>` — maps request ID to response sender

`TabInfo` struct:
```rust
pub struct TabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
    pub controlled: bool,    // true if a session is active
    pub session_id: Option<String>,
}
```

Methods:
- `new() -> Self`
- `list_tabs() -> Vec<TabInfo>` — returns snapshot of all connected tabs
- `tab_count() -> usize`
- `handle_connection(socket: WebSocket)` — per-tab connection handler:
  1. Receive first message from browser (must be `tab-info` with `tabId`, `url`, `title`)
  2. Register the tab in `tabs` and `tab_senders`
  3. Spawn write task: forward messages from `mpsc::Receiver` to the WebSocket
  4. Read loop: parse incoming JSON messages, route `interact-result` to `pending_requests` via `requestId`, update `tab-info` messages (URL/title changes)
  5. On disconnect: remove from `tabs` and `tab_senders`. If the tab had a session, keep the session for 5s (grace period for reconnection), then invalidate.

**Acceptance criteria:**
- [ ] `BrowserInteractionHub::new()` creates an empty hub
- [ ] `list_tabs()` returns empty vec when no connections
- [ ] `handle_connection` registers a tab when it sends `tab-info`
- [ ] `list_tabs()` returns the registered tab
- [ ] On disconnect, tab is removed from the registry
- [ ] Tab reconnection with same ID re-registers cleanly

---

### Task 2: WebSocket endpoint + route registration

**Files:**
- `native/vtz/src/server/http.rs` (modified — add route + handler)
- `native/vtz/src/server/module_server.rs` (modified — add `browser_hub` field to `DevServerState`)

**What to implement:**

1. Add `pub browser_hub: BrowserInteractionHub` to `DevServerState`.
2. Add WebSocket handler function:
   ```rust
   async fn ws_interact_handler(
       State(state): State<Arc<DevServerState>>,
       ws: WebSocketUpgrade,
   ) -> impl IntoResponse {
       ws.on_upgrade(move |socket| async move {
           state.browser_hub.handle_connection(socket).await;
       })
   }
   ```
3. Add route: `.route("/__vertz_interact", get(ws_interact_handler))`
4. Initialize `browser_hub: BrowserInteractionHub::new()` wherever `DevServerState` is constructed.

**Acceptance criteria:**
- [ ] `DevServerState` has a `browser_hub` field
- [ ] `/__vertz_interact` route is registered in the router
- [ ] WebSocket upgrade works (connection established)

---

### Task 3: `vertz_browser_list_tabs` MCP tool

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — add tool definition + execution)

**What to implement:**

1. Add `vertz_browser_list_tabs` to `tool_definitions()`:
   ```json
   {
     "name": "vertz_browser_list_tabs",
     "description": "List all connected browser tabs. Returns tab ID, current URL, page title, and whether a control session is active on each tab.",
     "inputSchema": { "type": "object", "properties": {}, "required": [] }
   }
   ```

2. Add handler in `execute_tool`:
   ```rust
   "vertz_browser_list_tabs" => {
       let tabs = state.browser_hub.list_tabs().await;
       let text = serde_json::to_string_pretty(&serde_json::json!({
           "tabs": tabs.iter().map(|t| serde_json::json!({
               "id": t.id,
               "url": t.url,
               "title": t.title,
               "controlled": t.controlled,
           })).collect::<Vec<_>>(),
       })).unwrap_or_default();
       Ok(serde_json::json!({
           "content": [{ "type": "text", "text": text }]
       }))
   }
   ```

**Acceptance criteria:**
- [ ] `vertz_browser_list_tabs` appears in tool definitions
- [ ] Returns `{ tabs: [] }` when no tabs connected
- [ ] Returns tab info when tabs are connected
- [ ] `controlled` field reflects session state

---

### Task 4: Browser-side interaction client

**Files:**
- `native/vtz/src/assets/interact-client.js` (new)
- `native/vtz/src/server/http.rs` (modified — inject the script in HTML responses, alongside hmr-client.js and error-overlay.js)

**What to implement:**

Create `interact-client.js` — a self-contained IIFE injected into dev mode pages alongside the HMR client and error overlay:

```javascript
(function() {
  'use strict';

  var WS_PATH = '/__vertz_interact';
  var TAB_ID_KEY = '__vertz_tab_id';
  var RECONNECT_BASE_MS = 500;
  var RECONNECT_MAX_MS = 5000;

  // ── Stable Tab ID ──────────────────────────────────────────
  var tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = 'tab-' + crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }

  // ── State ──────────────────────────────────────────────────
  var ws = null;
  var reconnectAttempts = 0;
  var reconnectTimer = null;
  var controlled = false;   // true when an agent has a session on this tab
  var sessionId = null;

  // ── Connection ─────────────────────────────────────────────
  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = protocol + '//' + location.host + WS_PATH;

    ws = new WebSocket(url);

    ws.onopen = function() {
      reconnectAttempts = 0;
      // Identify this tab to the server
      ws.send(JSON.stringify({
        type: 'tab-info',
        tabId: tabId,
        url: location.pathname + location.search,
        title: document.title
      }));
    };

    ws.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      handleMessage(msg);
    };

    ws.onclose = function() {
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = function() {
      // onclose will fire after this
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    var delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), RECONNECT_MAX_MS);
    reconnectAttempts++;
    reconnectTimer = setTimeout(function() {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // ── URL change detection ───────────────────────────────────
  // Send updated tab-info when the URL changes (SPA navigation)
  var lastUrl = location.pathname + location.search;
  function checkUrlChange() {
    var currentUrl = location.pathname + location.search;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'tab-info',
          tabId: tabId,
          url: currentUrl,
          title: document.title
        }));
      }
    }
  }
  // Listen for popstate (back/forward) and poll for pushState
  window.addEventListener('popstate', checkUrlChange);
  setInterval(checkUrlChange, 500);

  // ── Message Handling ───────────────────────────────────────
  function handleMessage(msg) {
    if (msg.type === 'control') {
      if (msg.action === 'connect') {
        controlled = true;
        sessionId = msg.sessionId;
      } else if (msg.action === 'disconnect') {
        controlled = false;
        sessionId = null;
      }
      return;
    }

    if (msg.type === 'interact') {
      // Phase 2+ will handle interaction actions here
      // For now, respond with "not implemented"
      sendResult(msg.requestId, false, 'Interaction not yet implemented');
      return;
    }
  }

  function sendResult(requestId, ok, errorOrSnapshot) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    var result = { type: 'interact-result', requestId: requestId };
    if (ok) {
      result.ok = true;
      result.snapshot = errorOrSnapshot;
    } else {
      result.ok = false;
      result.error = errorOrSnapshot;
    }
    ws.send(JSON.stringify(result));
  }

  // ── Expose for snapshot/interaction modules ────────────────
  globalThis.__vertz_interact = {
    tabId: tabId,
    isControlled: function() { return controlled; },
    sessionId: function() { return sessionId; },
    sendResult: sendResult,
  };

  // ── Start ──────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    connect();
  }
})();
```

For script injection: follow the same pattern as `hmr-client.js` and `error-overlay.js` — they are embedded as `include_str!` and injected into HTML responses via `<script>` tags.

**Acceptance criteria:**
- [ ] `interact-client.js` is injected into dev mode HTML pages
- [ ] Browser generates a stable tab ID via `sessionStorage`
- [ ] Browser connects to `/__vertz_interact` WebSocket on page load
- [ ] Browser sends `tab-info` message with tabId, url, title on connection
- [ ] Browser reconnects with the same tabId after disconnect
- [ ] URL changes (popstate, pushState) trigger updated `tab-info` messages
