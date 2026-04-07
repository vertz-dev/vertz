# Phase 3: Core Interactions — click, type, select

## Context

Phase 2 established session management and page snapshots. This phase adds the core interaction tools: click, type, and select. Each interaction dispatches real DOM events in the browser and returns an updated snapshot.

Design doc: `plans/mcp-browser-interaction.md`

## Tasks

### Task 1: Element targeting resolver (browser-side)

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified)

**What to implement:**

Add a `resolveTarget(target)` function that takes the `target` parameter from an interaction message and returns a DOM element:

```javascript
function resolveTarget(target) {
  if (!target) return { error: 'No target specified.' };

  // String: try as ref first, then as CSS selector
  if (typeof target === 'string') {
    // Check ref map from last snapshot
    var byRef = refToElement[target];
    if (byRef && byRef.isConnected) return { element: byRef };

    // Try as CSS selector
    try {
      var bySel = document.querySelector(target);
      if (bySel) return { element: bySel };
    } catch (e) {
      // Invalid selector, not an error — target might just be a stale ref
    }

    return { error: "Element ref '" + target + "' not found. The page may have changed — call vertz_browser_snapshot to refresh." };
  }

  // Object: { text, name, label }
  if (typeof target === 'object') {
    if (target.text) {
      var byText = findElementByText(target.text);
      if (byText) return { element: byText };
      return { error: "No element found with text '" + target.text + "'." };
    }
    if (target.name) {
      var byName = document.querySelector('[name="' + CSS.escape(target.name) + '"]');
      if (byName) return { element: byName };
      return { error: "No element found with name '" + target.name + "'." };
    }
    if (target.label) {
      var byLabel = findElementByLabel(target.label);
      if (byLabel) return { element: byLabel };
      return { error: "No element found with label '" + target.label + "'." };
    }
  }

  return { error: 'Invalid target format. Use a ref string, CSS selector, or { text, name, label } object.' };
}
```

Helper functions:
- `findElementByText(text)` — walk interactive elements, find deepest with matching `textContent.trim()`
- `findElementByLabel(labelText)` — find `<label>` by text, return its `for`-linked element or first input child

Also maintain a reverse map `refToElement` (populated during snapshot collection) that maps ref strings to DOM elements. Use `WeakRef` to avoid memory leaks:

```javascript
var refToElement = {};  // ref string -> WeakRef<HTMLElement>

// In collectSnapshot, after assigning refs:
refToElement = {};  // reset on each snapshot
for (var ref in refMap) {
  refToElement[ref] = refMap[ref];  // direct reference (replaced each snapshot)
}
```

**Acceptance criteria:**
- [ ] String ref resolves to the element from the last snapshot
- [ ] String CSS selector resolves via `querySelector`
- [ ] `{ text: "Submit" }` resolves to deepest element with matching text
- [ ] `{ name: "email" }` resolves to element with matching name attribute
- [ ] `{ label: "Email" }` resolves to the input associated with the matching label
- [ ] Stale refs return descriptive error message
- [ ] Invalid selectors don't throw, return error

---

### Task 2: Settle and auto-snapshot after interaction

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified)

**What to implement:**

Add a `settleAndSnapshot(requestId, maxElements, preNavUrl)` function that waits for the DOM to settle after an interaction, then collects and sends a snapshot:

```javascript
function settleAndSnapshot(requestId, maxElements, preNavUrl) {
  // Microtask yield
  Promise.resolve().then(function() {
    // requestAnimationFrame yield
    requestAnimationFrame(function() {
      // 250ms settle timeout for reactive cascades
      setTimeout(function() {
        var snapshot = collectSnapshot(maxElements || 50);

        // Detect navigation
        var currentUrl = location.pathname + location.search;
        var result = { ok: true, snapshot: snapshot };
        if (preNavUrl && preNavUrl !== currentUrl) {
          result.navigation = { from: preNavUrl, to: currentUrl };
        }

        sendResult(requestId, true, result);
      }, 250);
    });
  });
}
```

**Acceptance criteria:**
- [ ] Settle waits: microtask → rAF → 250ms → snapshot
- [ ] Snapshot is collected after settle completes
- [ ] Navigation detection: includes `{ from, to }` if URL changed
- [ ] Result is sent via `sendResult` with the requestId

---

### Task 3: Click, type, select interaction handlers + MCP tools

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified — add interaction handlers)
- `native/vtz/src/server/mcp.rs` (modified — add 3 tool definitions + handlers)

**What to implement:**

**Browser-side** — extend `handleMessage` for interaction actions:

```javascript
if (msg.type === 'interact') {
  var action = msg.action;
  var requestId = msg.requestId;

  if (action === 'snapshot') {
    var snapshot = collectSnapshot(msg.maxElements);
    sendResult(requestId, true, { ok: true, snapshot: snapshot });
    return;
  }

  var resolved = resolveTarget(msg.target);
  if (resolved.error) {
    sendResult(requestId, false, resolved.error);
    return;
  }
  var el = resolved.element;
  var preNavUrl = location.pathname + location.search;

  if (action === 'click') {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
    return;
  }

  if (action === 'type') {
    if (!isInputLike(el)) {
      sendResult(requestId, false, 'Target element is not an <input> or <textarea>.');
      return;
    }
    el.value = msg.text || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
    return;
  }

  if (action === 'select') {
    if (el.tagName.toLowerCase() !== 'select') {
      sendResult(requestId, false, 'Target element is not a <select>.');
      return;
    }
    el.value = msg.value || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
    return;
  }

  sendResult(requestId, false, 'Unknown action: ' + action);
}
```

**Rust MCP tools** — add to `tool_definitions()`:

```json
{
  "name": "vertz_browser_click",
  "description": "Click an element in the controlled browser tab. Target can be an element ref from a snapshot, a CSS selector, or { text: \"...\", name: \"...\", label: \"...\" }. Returns updated snapshot.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID. Optional if only one session is active." },
      "target": { "description": "Element ref, CSS selector, or { text, name, label } object." }
    },
    "required": ["target"]
  }
}
```

(Similar for `vertz_browser_type` with `text` param, `vertz_browser_select` with `value` param.)

Add handlers in `execute_tool` — all three follow the same pattern:
1. Resolve session via `browser_hub.resolve_session(session_id)`
2. Generate request ID
3. Build interaction message: `{ type: "interact", requestId, action, target, ... }`
4. Send to tab via `browser_hub.send_to_tab(tab_id, message)`
5. Wait for response via `browser_hub.wait_for_response(request_id, 10s)`
6. Return the response (snapshot or error)

Create a helper function `execute_browser_interaction` to avoid duplicating this pattern:
```rust
async fn execute_browser_interaction(
    hub: &BrowserInteractionHub,
    session_id: Option<&str>,
    action: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> { ... }
```

**Acceptance criteria:**
- [ ] `vertz_browser_click` dispatches MouseEvent on the target element
- [ ] `vertz_browser_type` sets input value and dispatches input/change events
- [ ] `vertz_browser_select` sets select value and dispatches input/change events
- [ ] All three return updated snapshot after 250ms settle
- [ ] Target resolution works for refs, CSS selectors, text/name/label objects
- [ ] Error returned when target element not found
- [ ] Error returned when element type is wrong (type on non-input, select on non-select)
- [ ] `sessionId` is optional when single session exists
- [ ] Navigation detection included when URL changes after click
