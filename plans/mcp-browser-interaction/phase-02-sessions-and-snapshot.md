# Phase 2: Session Management + Snapshot

## Context

Phase 1 established the `BrowserInteractionHub`, the `/__vertz_interact` WebSocket channel, and the `vertz_browser_list_tabs` tool. This phase adds session management (connect/disconnect) and the page snapshot — the agent's "eyes" into the live browser page.

Design doc: `plans/mcp-browser-interaction.md`

## Tasks

### Task 1: Session management in BrowserInteractionHub

**Files:**
- `native/vtz/src/server/browser_hub.rs` (modified)

**What to implement:**

Add session management methods to `BrowserInteractionHub`:

- `connect_session(tab_id: Option<&str>) -> Result<(String, TabInfo), String>`:
  1. If `tab_id` is `None` and exactly one tab is connected, auto-select it
  2. If `tab_id` is `None` and zero tabs: error "No browser tabs connected. Open the app in a browser first."
  3. If `tab_id` is `None` and multiple tabs: error "N tabs connected. Specify tabId. Call vertz_browser_list_tabs to see them."
  4. If tab not found: error "No browser tab with ID 'X'. Call vertz_browser_list_tabs to see connected tabs."
  5. If tab already controlled: error "Tab 'X' is already controlled by session 'Y'."
  6. Generate session ID (`sess-` + 8-char UUID)
  7. Update `TabInfo.controlled = true`, `TabInfo.session_id = Some(session_id)`
  8. Store in `sessions` map
  9. Send `control:connect` message to the tab's WebSocket
  10. Return session ID and tab info

- `disconnect_session(session_id: &str) -> Result<bool, String>`:
  1. Look up session → tab mapping
  2. Remove session from `sessions`
  3. Update `TabInfo.controlled = false`, `TabInfo.session_id = None`
  4. Send `control:disconnect` to the tab's WebSocket
  5. Return `true` on success

- `resolve_session(session_id: Option<&str>) -> Result<String, String>`:
  1. If `session_id` is provided, validate it exists, return the tab ID
  2. If `session_id` is `None` and exactly one session exists, return that tab ID
  3. Otherwise: appropriate error message

- `send_to_tab(tab_id: &str, message: serde_json::Value) -> Result<(), String>`:
  1. Look up tab sender
  2. Send JSON-serialized message
  3. Error if tab not found or send fails

- `wait_for_response(request_id: &str, timeout: Duration) -> Result<serde_json::Value, String>`:
  1. Register a `oneshot::Sender` in `pending_requests`
  2. Await the `oneshot::Receiver` with timeout
  3. Return the response or timeout error
  4. Clean up `pending_requests` entry on completion or timeout

**Acceptance criteria:**
- [ ] `connect_session(None)` auto-connects when one tab exists
- [ ] `connect_session(None)` errors when zero tabs exist
- [ ] `connect_session(None)` errors when multiple tabs exist (lists count)
- [ ] `connect_session(Some("tab-x"))` connects to the specific tab
- [ ] `connect_session` errors if tab already controlled
- [ ] `disconnect_session` releases the tab and cleans up
- [ ] `resolve_session(None)` auto-resolves single active session
- [ ] `send_to_tab` delivers message to the correct tab's WebSocket
- [ ] `wait_for_response` returns response matching requestId
- [ ] `wait_for_response` returns timeout error after 10s

---

### Task 2: Connect/Disconnect/Snapshot MCP tools

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — add 3 tool definitions + handlers)

**What to implement:**

Add to `tool_definitions()`:
```json
{
  "name": "vertz_browser_connect",
  "description": "Connect to a browser tab for interactive control. Returns a session ID and initial page snapshot. If tabId is omitted and exactly one tab is connected, auto-connects to it.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tabId": { "type": "string", "description": "Tab ID from vertz_browser_list_tabs. Optional if only one tab is connected." }
    },
    "required": []
  }
},
{
  "name": "vertz_browser_disconnect",
  "description": "Release a browser control session. The tab continues running normally.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID from vertz_browser_connect." }
    },
    "required": ["sessionId"]
  }
},
{
  "name": "vertz_browser_snapshot",
  "description": "Get a structured snapshot of the controlled page: interactive elements, their types, current values, available actions. Returns elements with refs that can be used as targets in interaction tools.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID. Optional if only one session is active." },
      "maxElements": { "type": "number", "description": "Maximum interactive elements to return (default: 50)." }
    },
    "required": []
  }
}
```

Add handlers in `execute_tool`:

For `vertz_browser_connect`:
1. Call `browser_hub.connect_session(tab_id)`
2. Generate request ID, send `{ type: "interact", requestId, action: "snapshot", maxElements: 50 }` to the tab
3. Wait for response (10s timeout)
4. Return `{ sessionId, tab: { id, url, title }, snapshot: { ... } }`

For `vertz_browser_disconnect`:
1. Call `browser_hub.disconnect_session(session_id)`
2. Return `{ released: true }`

For `vertz_browser_snapshot`:
1. Call `browser_hub.resolve_session(session_id)` to get tab ID
2. Generate request ID, send `{ type: "interact", requestId, action: "snapshot", maxElements }` to tab
3. Wait for response (10s timeout)
4. Return the snapshot

**Acceptance criteria:**
- [ ] `vertz_browser_connect` returns session ID + snapshot
- [ ] `vertz_browser_connect({})` auto-connects to single tab
- [ ] `vertz_browser_disconnect` releases the session
- [ ] `vertz_browser_snapshot` returns current page state
- [ ] `vertz_browser_snapshot({})` auto-resolves single session
- [ ] All tools return structured error messages on failure

---

### Task 3: Browser-side snapshot collection

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified — add snapshot collection)

**What to implement:**

Add snapshot collection to `interact-client.js`:

```javascript
function collectSnapshot(maxElements) {
  maxElements = maxElements || 50;
  var snapshot = {
    url: location.pathname + location.search,
    title: document.title,
    focused: null,
    settled: true,     // TODO: check pending queries in Phase 4
    pending: [],
    elements: [],
    customActions: [],  // TODO: Phase 4
    forms: []
  };

  // Find interactive elements
  var selector = 'input,button,select,textarea,a,[role="button"],[role="link"],[role="checkbox"],[role="tab"]';
  var allElements = document.querySelectorAll(selector);
  var refMap = {};  // element -> ref
  var elementCount = 0;

  for (var i = 0; i < allElements.length && elementCount < maxElements; i++) {
    var el = allElements[i];
    if (!el.isConnected || isHidden(el)) continue;

    var ref = assignRef(el, refMap);
    var info = serializeElement(el, ref);
    if (info) {
      snapshot.elements.push(info);
      elementCount++;
    }
  }

  // Focused element
  if (document.activeElement && document.activeElement !== document.body) {
    var focusedRef = getRef(document.activeElement, refMap);
    if (focusedRef) snapshot.focused = focusedRef;
  }

  // Forms
  var forms = document.querySelectorAll('form');
  for (var f = 0; f < forms.length; f++) {
    var form = forms[f];
    var formRef = assignRef(form, refMap);
    var fieldRefs = [];
    var formFields = form.querySelectorAll('input,select,textarea');
    for (var j = 0; j < formFields.length; j++) {
      var fieldRef = getRef(formFields[j], refMap);
      if (fieldRef) fieldRefs.push(fieldRef);
    }
    snapshot.forms.push({
      ref: formRef,
      action: form.action || '',
      method: (form.method || 'GET').toUpperCase(),
      fields: fieldRefs,
      errors: {}  // TODO: integrate with Vertz form() API
    });
  }

  return snapshot;
}
```

Helper functions:
- `assignRef(el, refMap)` — deterministic: `data-testid` > `id` > `name` > positional `eN`
- `getRef(el, refMap)` — look up existing ref
- `serializeElement(el, ref)` — returns element descriptor with tag, type, name, value, label, etc. Masks password values. Includes `checked` for checkboxes/radios, `options` for selects, `href` for links, `disabled`/`readonly`/`required` attributes.
- `isHidden(el)` — checks `display:none` or `visibility:hidden`
- `findLabel(el)` — finds associated `<label>` by `for` attribute or wrapping `<label>`

Update `handleMessage` to handle `interact` messages with `action: "snapshot"`:
```javascript
if (msg.type === 'interact' && msg.action === 'snapshot') {
  var snapshot = collectSnapshot(msg.maxElements);
  sendResult(msg.requestId, true, snapshot);
  return;
}
```

**Acceptance criteria:**
- [ ] Snapshot includes all interactive elements up to `maxElements`
- [ ] Element refs are deterministic: `data-testid` > `id` > `name` > positional
- [ ] Input elements include type, name, value, placeholder, label
- [ ] Password inputs have value masked as `"********"`
- [ ] Select elements include options array with value and text
- [ ] Checkbox/radio elements include `checked` field
- [ ] Links include `href`
- [ ] Buttons include text content
- [ ] `focused` field shows the currently focused element's ref
- [ ] `forms` array lists each form with its field refs
- [ ] Hidden elements are excluded
- [ ] Snapshot is sent as `interact-result` response
