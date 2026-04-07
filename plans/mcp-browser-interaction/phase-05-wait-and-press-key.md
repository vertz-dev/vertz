# Phase 5: Wait and Press Key

## Context

Phase 4 completed the core form interaction tools. This phase adds the Phase 2 tools from the design: `vertz_browser_press_key` and `vertz_browser_wait`. These handle keyboard interaction and async condition waiting.

Design doc: `plans/mcp-browser-interaction.md`

## Tasks

### Task 1: press_key browser-side handler + MCP tool

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified)
- `native/vtz/src/server/mcp.rs` (modified)

**What to implement:**

**Browser-side** — add `press_key` action handler:

```javascript
if (action === 'press_key') {
  var target = document.activeElement || document.body;
  var key = msg.key || '';
  target.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true, cancelable: true }));
  settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
  return;
}
```

**MCP tool** — add to `tool_definitions()`:
```json
{
  "name": "vertz_browser_press_key",
  "description": "Press a keyboard key. Dispatches keydown + keyup on the currently focused element. Use for Enter, Escape, Tab, arrow keys, etc.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID. Optional if only one session is active." },
      "key": { "type": "string", "description": "Key to press (e.g., 'Enter', 'Escape', 'Tab', 'ArrowDown')." }
    },
    "required": ["key"]
  }
}
```

**Acceptance criteria:**
- [ ] `press_key` dispatches keydown + keyup on the focused element
- [ ] Falls back to `document.body` if nothing is focused
- [ ] Returns updated snapshot after settle
- [ ] Supports standard key names (Enter, Escape, Tab, ArrowDown, etc.)

---

### Task 2: wait browser-side handler + MCP tool

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified)
- `native/vtz/src/server/mcp.rs` (modified)

**What to implement:**

**Browser-side** — add `wait` action handler:

```javascript
if (action === 'wait') {
  var condition = msg.condition || {};
  var timeoutMs = msg.timeoutMs || 5000;
  waitForCondition(condition, timeoutMs, function(ok, elapsed) {
    if (ok) {
      var snapshot = collectSnapshot(msg.maxElements || 50);
      sendResult(requestId, true, { ok: true, elapsed: elapsed, snapshot: snapshot });
    } else {
      sendResult(requestId, false, 'Condition not met within ' + timeoutMs + 'ms.');
    }
  });
  return;
}
```

Add `waitForCondition(condition, timeoutMs, callback)`:

```javascript
function waitForCondition(condition, timeoutMs, callback) {
  var startTime = Date.now();
  var intervalMs = 100;

  function check() {
    var elapsed = Date.now() - startTime;

    if (checkCondition(condition)) {
      callback(true, elapsed);
      return;
    }

    if (elapsed >= timeoutMs) {
      callback(false, elapsed);
      return;
    }

    setTimeout(check, intervalMs);
  }

  // Check immediately first (condition may already be met)
  check();
}

function checkCondition(condition) {
  // { text: "..." } — check if text appears on the page
  if (condition.text) {
    return document.body.textContent.indexOf(condition.text) !== -1;
  }

  // { selector: "..." } — check if element exists
  if (condition.selector) {
    return document.querySelector(condition.selector) !== null;
  }

  // { url: "..." } — check current URL path
  if (condition.url) {
    return (location.pathname + location.search) === condition.url ||
           location.pathname === condition.url;
  }

  // { absent: "..." } — check if element is gone
  if (condition.absent) {
    return document.querySelector(condition.absent) === null;
  }

  return false;
}
```

**MCP tool** — add to `tool_definitions()`:
```json
{
  "name": "vertz_browser_wait",
  "description": "Wait for a condition to be met in the browser. Checks immediately, then polls every 100ms until the condition is met or timeout. Conditions: { text: '...' } for text on page, { selector: '...' } for element existence, { url: '...' } for URL match, { absent: '...' } for element removal.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID. Optional if only one session is active." },
      "condition": {
        "type": "object",
        "description": "Condition to wait for. One of: { text: '...' }, { selector: '...' }, { url: '...' }, { absent: '...' }."
      },
      "timeoutMs": { "type": "number", "description": "Maximum wait time in milliseconds (default: 5000)." }
    },
    "required": ["condition"]
  }
}
```

The Rust handler uses a **longer timeout** for `wait_for_response` — up to `timeoutMs + 2000ms` (the extra 2s is buffer for network round-trip and settle time). This prevents the server-side timeout from firing before the browser-side timeout.

**Acceptance criteria:**
- [ ] `wait` checks condition immediately; returns `elapsed: 0` if already met
- [ ] `{ text: "..." }` waits for text to appear on the page
- [ ] `{ selector: "..." }` waits for element to exist
- [ ] `{ url: "..." }` waits for URL to match
- [ ] `{ absent: "..." }` waits for element to disappear
- [ ] Returns timeout error if condition not met within `timeoutMs`
- [ ] Returns snapshot on success
- [ ] Server-side timeout exceeds browser-side timeout (no premature timeout)

---

### Task 3: Documentation update

**Files:**
- `packages/mint-docs/guides/dev-server-tools.mdx` (modified)
- `packages/create-vertz-app/src/templates/index.ts` (modified — update scaffold rule)

**What to implement:**

Update the dev server MCP tools guide to document all 11 browser interaction tools:

1. Add a "Browser Interaction" section to the guide
2. Document each tool with description, parameters, and example responses
3. Show the recommended workflow: connect → snapshot → interact → disconnect
4. Document the auto-connect shorthand for single-tab scenarios
5. Document element targeting (ref, selector, text, name, label)

Update the scaffold template (`devServerToolsRuleTemplate`) to include browser interaction tools in the mandatory verification workflow:
- After code change: `vertz_get_errors` → `vertz_render_page` → `vertz_browser_connect` → interact → `vertz_browser_disconnect`

**Acceptance criteria:**
- [ ] All 11 browser interaction tools documented in the guide
- [ ] Scaffold rule updated with browser interaction in verification workflow
- [ ] Examples show both full and shorthand (auto-connect) workflows
