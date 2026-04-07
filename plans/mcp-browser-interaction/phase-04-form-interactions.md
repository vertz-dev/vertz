# Phase 4: Form Interactions — fill_form, submit

## Context

Phase 3 added click, type, select. This phase adds form-level interactions: filling multiple fields at once and submitting forms. It also adds navigation-aware settle detection for form submissions that trigger redirects.

Design doc: `plans/mcp-browser-interaction.md`

## Tasks

### Task 1: fill_form and submit browser-side handlers

**Files:**
- `native/vtz/src/assets/interact-client.js` (modified)

**What to implement:**

Add `fill_form` and `submit` action handlers:

```javascript
if (action === 'fill_form') {
  var formResolved = resolveTarget(msg.target);
  if (formResolved.error) {
    sendResult(requestId, false, formResolved.error);
    return;
  }
  var formEl = formResolved.element;
  if (formEl.tagName.toLowerCase() !== 'form') {
    sendResult(requestId, false, 'Target is not a <form> element.');
    return;
  }
  var data = msg.data || {};
  var fillError = fillFormFields(formEl, data);
  if (fillError) {
    sendResult(requestId, false, fillError);
    return;
  }
  settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
  return;
}

if (action === 'submit') {
  var submitResolved = resolveTarget(msg.target);
  if (submitResolved.error) {
    sendResult(requestId, false, submitResolved.error);
    return;
  }
  var submitEl = submitResolved.element;
  if (submitEl.tagName.toLowerCase() !== 'form') {
    sendResult(requestId, false, 'Target is not a <form> element.');
    return;
  }
  submitEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  // Use navigation-aware settle for submit (2s cap)
  settleAfterNavigation(requestId, msg.maxElements, preNavUrl);
  return;
}
```

Add `fillFormFields(formEl, data)` — fills form fields by name:
```javascript
function fillFormFields(formEl, data) {
  for (var name in data) {
    if (!data.hasOwnProperty(name)) continue;
    var value = data[name];
    var elements = formEl.querySelectorAll('[name="' + CSS.escape(name) + '"]');
    if (elements.length === 0) {
      return 'No field with name "' + name + '" found in the form.';
    }
    var first = elements[0];

    // Radio buttons
    if (first instanceof HTMLInputElement && first.type === 'radio') {
      var matched = false;
      for (var r = 0; r < elements.length; r++) {
        if (elements[r].value === value) {
          elements[r].checked = true;
          elements[r].dispatchEvent(new Event('input', { bubbles: true }));
          elements[r].dispatchEvent(new Event('change', { bubbles: true }));
          matched = true;
        }
      }
      if (!matched) return 'No radio button "' + name + '" with value "' + value + '".';
      continue;
    }

    // Checkboxes
    if (first instanceof HTMLInputElement && first.type === 'checkbox') {
      first.checked = (value === 'true' || value === true);
      first.dispatchEvent(new Event('input', { bubbles: true }));
      first.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }

    // Select, input, textarea
    if (first instanceof HTMLSelectElement || first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
      first.value = String(value);
      first.dispatchEvent(new Event('input', { bubbles: true }));
      first.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }

    return 'Field "' + name + '" is not a supported form field type.';
  }
  return null; // success
}
```

Add `settleAfterNavigation(requestId, maxElements, preNavUrl)` — waits longer for navigation:
```javascript
function settleAfterNavigation(requestId, maxElements, preNavUrl) {
  var settled = false;
  var checkCount = 0;
  var maxChecks = 20; // 2 seconds total (100ms * 20)

  function check() {
    checkCount++;
    var currentUrl = location.pathname + location.search;
    var urlChanged = preNavUrl !== currentUrl;

    if (urlChanged || checkCount >= maxChecks) {
      // Wait one more rAF + microtask after URL settles
      Promise.resolve().then(function() {
        requestAnimationFrame(function() {
          setTimeout(function() {
            var snapshot = collectSnapshot(maxElements || 50);
            var result = { ok: true, snapshot: snapshot };
            if (preNavUrl !== (location.pathname + location.search)) {
              result.navigation = { from: preNavUrl, to: location.pathname + location.search };
            }
            sendResult(requestId, true, result);
          }, 250);
        });
      });
      return;
    }

    setTimeout(check, 100);
  }

  // Start after microtask + rAF (to let the submit event propagate)
  Promise.resolve().then(function() {
    requestAnimationFrame(function() {
      check();
    });
  });
}
```

**Acceptance criteria:**
- [ ] `fill_form` fills all named fields in the form
- [ ] `fill_form` handles text inputs, textareas, selects, checkboxes, radios
- [ ] `fill_form` dispatches `input` and `change` events for each field
- [ ] `fill_form` returns error for missing field names
- [ ] `submit` dispatches `submit` event on the form
- [ ] `submit` uses navigation-aware settle (up to 2s for URL change)
- [ ] `submit` returns navigation `{ from, to }` when URL changes
- [ ] Both return updated snapshot after settle

---

### Task 2: fill_form and submit MCP tools

**Files:**
- `native/vtz/src/server/mcp.rs` (modified — add 2 tool definitions + handlers)

**What to implement:**

Add to `tool_definitions()`:
```json
{
  "name": "vertz_browser_fill_form",
  "description": "Fill multiple form fields at once. Handles text inputs, textareas, selects, checkboxes, and radio buttons. Target must be a form ref from the snapshot.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID. Optional if only one session is active." },
      "target": { "type": "string", "description": "Form ref from snapshot (e.g., 'f1')." },
      "data": { "type": "object", "description": "Field name → value mapping, e.g. { \"title\": \"My Task\", \"priority\": \"high\" }." }
    },
    "required": ["target", "data"]
  }
},
{
  "name": "vertz_browser_submit",
  "description": "Submit a form by dispatching a submit event. Waits for navigation if it occurs (up to 2s). Returns updated snapshot with navigation info.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Session ID. Optional if only one session is active." },
      "target": { "type": "string", "description": "Form ref from snapshot (e.g., 'f1')." }
    },
    "required": ["target"]
  }
}
```

Use the existing `execute_browser_interaction` helper from Phase 3. The `fill_form` handler passes `data` through to the browser. The `submit` handler passes just the target.

**Acceptance criteria:**
- [ ] `vertz_browser_fill_form` fills fields by name and returns updated snapshot
- [ ] `vertz_browser_submit` submits form and returns snapshot + navigation info
- [ ] Both tools support optional `sessionId`
- [ ] Error responses for invalid targets, missing fields, unsupported field types

---

### Task 3: Localhost-only security check

**Files:**
- `native/vtz/src/server/browser_hub.rs` (modified)

**What to implement:**

Add a `host` field to `BrowserInteractionHub` (set from `DevServerState` host config at construction). In `connect_session`, check if the server is bound to a non-localhost address:

```rust
pub fn new(host: &str) -> Self {
    Self {
        localhost_only: host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "0.0.0.0",
        // Note: 0.0.0.0 is allowed because it's a common dev default, but we log a warning.
        // If host is explicitly a LAN IP (e.g., "192.168.1.5"), block interaction tools.
        allow_interactions: host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "0.0.0.0",
        ...
    }
}
```

Actually, simpler: always allow interactions (it's a dev server). But if bound to `0.0.0.0`, log a warning at startup:
```
[Server] Browser interaction tools are active. Server is bound to 0.0.0.0 — interaction commands are accessible from the network.
```

**Acceptance criteria:**
- [ ] Warning logged when server bound to `0.0.0.0` and browser hub is active
- [ ] No warning for localhost/127.0.0.1
