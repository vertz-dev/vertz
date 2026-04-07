# MCP Browser Interaction Tools

> Let coding agents interact with live web pages through the dev server MCP — no browser MCP required.

## Problem

Coding agents (Claude Code, Cursor, Codex, Gemini) can write code and verify it compiles, but they can't **interact with the running application**. Today they rely on:

1. **Playwright MCP** — requires a separate browser process, separate MCP server, complex setup
2. **`vertz_render_page`** — SSR snapshot only, no interactivity (can't click, type, submit)
3. **`vertz_navigate`** — changes the URL but can't interact with the page content

The gap: agents can *see* a page (via SSR render) but can't *use* it. They can't click a dropdown, fill a form, select an option, or submit data. This means they can't verify that their UI code actually works end-to-end.

### Relationship to existing tools

- **`vertz_render_page`** = static SSR snapshot. No browser needed, works offline. Shows what the server renders. Use for verifying markup, layout, and SSR correctness.
- **`vertz_browser_snapshot`** (new) = live browser state. Requires a connected browser tab. Shows the actual DOM *after* JavaScript has run, hydrated, and settled. Use for verifying interactive behavior, form state, and runtime correctness.

Agents should use both: `vertz_render_page` to verify SSR, then browser interaction tools to verify runtime behavior.

## Solution

Extend the dev server MCP with **browser interaction tools** that dispatch real DOM events to the live browser page. The dev server acts as a bridge — agent sends MCP tool call, server relays to the browser via WebSocket, browser executes the interaction and reports the result.

### Key Design Decision: Tab Sessions

When multiple browser tabs are open, interactions must target a **single tab** (not broadcast to all). The agent opens a "control session" with one specific tab and all subsequent interactions go to that tab only.

## API Surface

### Phased Rollout

**Phase 1 (MVP):** 9 tools covering form-based workflows — `list_tabs`, `connect`, `disconnect`, `snapshot`, `click`, `type`, `select`, `fill_form`, `submit`

**Phase 2:** 2 additional tools for more complex interactions — `press_key`, `wait`

### New MCP Tools

```typescript
// ── Session Management ──────────────────────────────────────────

/**
 * List connected browser tabs.
 * Returns tab ID, URL, title, and whether a control session is active.
 */
vertz_browser_list_tabs()
// → { tabs: [{ id: "tab-a1b2", url: "/tasks", title: "Tasks | My App", controlled: false }] }

/**
 * Claim a tab for exclusive agent control.
 * Returns the tab snapshot (DOM summary) after connecting.
 * Only one control session per tab at a time.
 *
 * If tabId is omitted and exactly one tab is connected, auto-connects to it.
 */
vertz_browser_connect({ tabId?: "tab-a1b2" })
// → { sessionId: "sess-x1y2", tab: { id: "tab-a1b2", url: "/tasks", title: "..." }, snapshot: { ... } }

/**
 * Release the control session. The tab continues running normally.
 */
vertz_browser_disconnect({ sessionId: "sess-x1y2" })
// → { released: true }

// ── Page Snapshot ───────────────────────────────────────────────

/**
 * Get a structured snapshot of the current page: interactive elements,
 * their types, current values, available actions.
 *
 * This is the agent's "eyes" — it replaces needing a screenshot.
 */
vertz_browser_snapshot({ sessionId: "sess-x1y2", maxElements?: 50 })
// → {
//   url: "/tasks/new",
//   title: "New Task | My App",
//   focused: "e1",                    // ref of the currently focused element
//   settled: true,                    // false if pending queries/fetches
//   pending: [],                      // in-flight query keys (empty = settled)
//   elements: [
//     { ref: "title", tag: "input", name: "title", type: "text", value: "",
//       placeholder: "Task title", label: "Title", focused: true },
//     { ref: "priority", tag: "select", name: "priority", value: "medium",
//       options: [{ value: "low", text: "Low" }, { value: "medium", text: "Medium" }, { value: "high", text: "High" }],
//       label: "Priority" },
//     { ref: "description", tag: "textarea", name: "description", value: "",
//       placeholder: "Describe the task...", label: "Description" },
//     { ref: "e4", tag: "button", text: "Create Task", type: "submit", disabled: false },
//     { ref: "e5", tag: "button", text: "Cancel", type: "button", disabled: false },
//     { ref: "e6", tag: "a", text: "Back to Tasks", href: "/tasks" },
//     { ref: "accept-terms", tag: "input", type: "checkbox", name: "accept",
//       checked: false, label: "Accept terms" },
//   ],
//   customActions: [
//     { ref: "e7", component: "TaskCard", event: "onStatusChange",
//       description: "Changes task status",
//       triggerHint: "Click the status badge to cycle through states" },
//   ],
//   forms: [
//     { ref: "f1", action: "/api/tasks", method: "POST",
//       fields: ["title", "priority", "description"],
//       errors: {} }                  // per-field validation errors after submit
//   ]
// }

// ── Interactions (Phase 1) ──────────────────────────────────────

/**
 * Click an element by ref, CSS selector, or text content.
 */
vertz_browser_click({
  sessionId: "sess-x1y2",
  target: "e4"               // element ref from snapshot
  // OR: target: "#submit-btn"   // CSS selector
  // OR: target: { text: "Create Task" }  // by visible text
  // OR: target: { name: "priority" }     // by name attribute
  // OR: target: { label: "Priority" }    // by associated label
})
// → { ok: true, snapshot: { ... } }  // returns updated snapshot

/**
 * Type text into an input or textarea.
 */
vertz_browser_type({
  sessionId: "sess-x1y2",
  target: "title",           // element ref (deterministic: uses name attr)
  text: "Implement MCP browser tools"
})
// → { ok: true, snapshot: { ... } }

/**
 * Select an option from a <select> element.
 */
vertz_browser_select({
  sessionId: "sess-x1y2",
  target: "priority",
  value: "high"
})
// → { ok: true, snapshot: { ... } }

/**
 * Fill multiple form fields at once.
 */
vertz_browser_fill_form({
  sessionId: "sess-x1y2",
  target: "f1",              // form ref from snapshot
  data: {
    title: "Implement MCP browser tools",
    priority: "high",
    description: "Add browser interaction MCP tools to the dev server"
  }
})
// → { ok: true, snapshot: { ... } }

/**
 * Submit a form. Equivalent to clicking the submit button.
 */
vertz_browser_submit({
  sessionId: "sess-x1y2",
  target: "f1"               // form ref
})
// → { ok: true, snapshot: { ... }, navigation: { from: "/tasks/new", to: "/tasks" } }

// ── Interactions (Phase 2) ──────────────────────────────────────

/**
 * Press a keyboard key (e.g., Enter, Escape, Tab).
 */
vertz_browser_press_key({
  sessionId: "sess-x1y2",
  key: "Escape"
})
// → { ok: true, snapshot: { ... } }

/**
 * Wait for a condition to be met (element appears, text changes, navigation).
 * Prevents agents from racing ahead of async operations.
 */
vertz_browser_wait({
  sessionId: "sess-x1y2",
  condition: { text: "Task created successfully" },
  // OR: condition: { selector: "[data-testid='success-toast']" },
  // OR: condition: { url: "/tasks" },
  // OR: condition: { absent: "[data-testid='loading-spinner']" },
  timeoutMs: 5000
})
// → { ok: true, elapsed: 230, snapshot: { ... } }
```

### Snapshot Element Discovery

The snapshot is the core of the interaction model. It tells the agent **what's on the page and what can be done**. Element discovery works at two levels:

**1. Native interactive elements** — inputs, buttons, selects, links, textareas. Discovered by `querySelectorAll('input,button,select,textarea,a,[role="button"],[role="link"],[role="checkbox"],[role="tab"]')`. Each element includes:
- `ref`: Deterministic ID — prefers `data-testid` > `id` > `name` > positional (`e1`, `e2`). Stable across snapshots when possible.
- `tag`, `type`, `name`, `value`, `placeholder`, `label` (associated `<label>`)
- `disabled`, `readonly`, `required` attributes
- `checked` for checkboxes and radios
- `focused` if this element has focus
- `error` — validation error message (from Vertz `form()` API if present)
- For `<select>`: `options` array with `{ value, text }` objects
- For `<a>`: `href`
- For `<button>`: `text` content, form association
- For `<input type="password">`: `value` is always masked as `"********"`

**2. Custom actions** — Vertz component event callbacks (onStatusChange, onDrop, etc.; standard onClick/onSubmit are covered by native element discovery). Discovered via a dev-only action registry. The compiler emits a `__regAction(el, component, prop)` call alongside each `__on()` call in dev mode. The snapshot builder queries this registry.

Each custom action includes:
- Component name and event name
- A human-readable `description` (derived from prop name: `onStatusChange` → "Changes task status")
- A `triggerHint` — contextual hint about which DOM interaction triggers this action (derived from element role, aria-label, or surrounding text)
- The element `ref` it's bound to

Custom actions are **discoverable but not directly invocable** in v1. The agent uses DOM interactions (click the button that triggers the status change). Direct callback invocation is future work.

### Element Targeting

Every interaction tool accepts a `target` that resolves to a DOM element:
- **Ref** (`"title"`, `"e3"`): From the most recent snapshot. Fast, unambiguous.
- **CSS selector** (`"#task-title"`, `"[data-testid='submit']"`): Standard DOM query.
- **Text match** (`{ text: "Create Task" }`): Finds the deepest element matching the text.
- **Name** (`{ name: "priority" }`): Form field by name attribute.
- **Label** (`{ label: "Priority" }`): Form field by associated label text.

### Session Convenience

When only one browser tab is connected (the common case), the `sessionId` parameter can be omitted from interaction tools. The server auto-resolves to the only active session.

When `vertz_browser_connect` is called without a `tabId` and exactly one tab is connected, it auto-connects to that tab. This makes the single-tab workflow zero-ceremony:

```typescript
// Single-tab shorthand (most common case)
vertz_browser_connect()    // auto-connects to the only tab
vertz_browser_click({ target: { text: "New Task" } })   // sessionId implied
```

## Architecture

```
Agent (Claude Code)          Dev Server (Rust)              Browser Tab
──────────────────          ─────────────────              ────────────

 vertz_browser_connect ───→  Creates control session   ──→  Ack on interact channel
      { tabId }               Maps session → tab WS         Activates interaction runtime

 vertz_browser_click ─────→  Validates session         ──→  Dispatches MouseEvent
      { sessionId, target }   Routes to tab WS              Waits for settle
                            ←── Returns snapshot ───────←   Collects + sends snapshot

 vertz_browser_snapshot ──→  Validates session         ──→  Walks DOM + registry
      { sessionId }           Waits for response             Serializes elements
                            ←── Returns snapshot ───────←   Sends snapshot JSON
```

### Transport: Dedicated WebSocket Channel

Browser interaction uses a **dedicated `/__vertz_interact` WebSocket channel**, separate from the existing channels:

| Channel | Purpose | Routing |
|---------|---------|---------|
| `/__vertz_hmr` | HMR updates, CSS updates, navigation | Broadcast to all tabs |
| `/__vertz_errors` | Error overlay, state inspection | Broadcast + request/response |
| `/__vertz_interact` | Browser interaction tools | Targeted to one tab per session |

Separating the channel keeps the routing clean — no mixing of broadcast semantics with targeted session-based messaging.

**Server → Browser:**
```json
{ "type": "interact", "requestId": "req-123", "action": "click", "target": "e4" }
{ "type": "interact", "requestId": "req-124", "action": "snapshot", "maxElements": 50 }
{ "type": "control", "action": "connect", "sessionId": "sess-x1y2" }
{ "type": "control", "action": "disconnect" }
```

**Browser → Server:**
```json
{ "type": "interact-result", "requestId": "req-123", "ok": true, "snapshot": { ... } }
{ "type": "interact-result", "requestId": "req-123", "ok": false, "error": "Element not found" }
{ "type": "tab-info", "tabId": "tab-a1b2", "url": "/tasks", "title": "Tasks | My App" }
```

### Tab Identity: Client-Generated Stable IDs

Each browser tab generates its own stable ID via `sessionStorage`, surviving reconnections, refreshes, and HMR reloads:

```javascript
var TAB_ID_KEY = '__vertz_tab_id';
var tabId = sessionStorage.getItem(TAB_ID_KEY);
if (!tabId) {
  tabId = 'tab-' + crypto.randomUUID().slice(0, 8);
  sessionStorage.setItem(TAB_ID_KEY, tabId);
}
// Sent in the WebSocket handshake
```

The server maps stable tab IDs to current WebSocket connections. When a tab reconnects (after refresh, HMR reload, or network blip), it re-identifies itself with the same tab ID, and the existing control session remains valid.

### Session Lifecycle

1. Agent calls `vertz_browser_list_tabs` → server returns all connected tabs with their URLs
2. Agent calls `vertz_browser_connect({ tabId })` → server creates a control session, marks the tab as controlled, sends `control:connect` to the specific tab
3. All subsequent interaction tools require `sessionId` (or auto-resolve if single session) → server routes to the specific tab's WebSocket on `/__vertz_interact`
4. Agent calls `vertz_browser_disconnect` or the WebSocket closes → session is cleaned up
5. Tab navigations update the tab's URL in the server state
6. If the controlled tab disconnects (user closes it) and doesn't reconnect within 5s, the session is invalidated — next interaction returns an error
7. If the MCP tool call doesn't get a response from the browser within 10s, it returns a timeout error

### Custom Action Discovery

The Vertz compiler already uses `__on(el, event, handler)` for all event bindings. To make custom actions discoverable:

**Approach: `WeakMap` side-registration inside `__on` (dev mode only)**

Rather than modifying the compiler, we add a 3-line registration inside the existing `__on()` function in `packages/ui/src/dom/events.ts`. In dev mode, `__on` receives an optional 4th parameter (the component/prop metadata), and registers it in a `WeakMap<HTMLElement, ActionMeta[]>`:

```typescript
// packages/ui/src/dom/events.ts — dev-mode extension
const __actionRegistry = new WeakMap<HTMLElement, ActionMeta[]>();

export function __on(el: HTMLElement, event: string, handler: EventListener, meta?: ActionMeta): () => void {
  el.addEventListener(event, handler);
  if (meta) {
    const existing = __actionRegistry.get(el) ?? [];
    existing.push(meta);
    __actionRegistry.set(el, existing);
  }
  // ... existing cleanup logic
}
```

The compiler already emits `__on(el, event, handler)` for every JSX event binding. The only compiler change is adding the metadata object as a 4th argument **for prop-forwarded callbacks only** (the `onXxx` props from user components, not internal framework events). This is a small, targeted change in the JSX attribute handling path.

**Why not a separate `__regAction` function?** Keeping it as an optional parameter to `__on` means the registration is atomic with the event binding — no risk of the registration and binding getting out of sync.

**Filtering:** Only prop-forwarded callbacks (the `onXxx` pattern from user components) get metadata. Internal framework wiring and native DOM events do not. The compiler already distinguishes these — it knows when it's forwarding a component prop vs. emitting a native event handler.

**`WeakMap` ensures no memory leaks** when elements are removed from the DOM. The snapshot builder queries this map during snapshot collection.

### Snapshot Collection and Performance

**Collection strategy:**
- Use `querySelectorAll` with a combined selector for interactive elements — faster than TreeWalker
- Default `maxElements: 50`, configurable per call
- Cache the element → ref mapping between snapshots using a `WeakMap<HTMLElement, string>`. Only re-walk changed subtrees (tracked via MutationObserver when a control session is active)
- Total snapshot response capped at 2MB (consistent with state inspector)

**Settle timing after interaction:**
- Standard interactions (click, type, select): Dispatch event → microtask yield → `requestAnimationFrame` → 250ms settle timeout → collect snapshot. The 250ms covers synchronous reactive cascades (signal updates, computed recalculations, DOM patches).
- Navigation-inducing interactions (link click, form submit): After detecting a URL change, the browser-side handler waits for the new page to settle: poll until `document.readyState === 'complete'` AND the URL stabilizes AND a `requestAnimationFrame` + microtask pass with no further DOM mutations (via MutationObserver). Capped at 2 seconds. If the page hasn't settled, the snapshot is returned with `settled: false`.
- For async operations (data fetching), the snapshot includes `settled: false` and `pending: ["query-key-1"]` — the agent should use `vertz_browser_wait` to wait for these to resolve.
- `vertz_browser_wait` checks the condition immediately against the current DOM first. If already met, returns with `elapsed: 0`. Otherwise subscribes to DOM mutations and re-checks until met or timeout.

### Navigation Integration

The existing `vertz_navigate` tool broadcasts to all tabs. With sessions, agents should use session-aware navigation:

```typescript
// Navigates the controlled tab only (not all tabs)
vertz_browser_click({ sessionId: "sess-x1y2", target: { text: "Tasks" } })  // click a link

// Or use vertz_navigate for broadcast navigation (existing behavior, no session needed)
vertz_navigate({ to: "/tasks" })
```

Session-aware navigation happens naturally through link clicks. The existing `vertz_navigate` remains for cases where no session is needed.

### Security

- **Dev-only**: Interaction tools are only available when the dev server is running. Not available in production.
- **Localhost-only for interaction tools**: If the dev server is bound to `0.0.0.0` (network-accessible), `vertz_browser_connect` refuses with an error: "Browser interaction tools are only available when the server is bound to localhost. Restart with `--host localhost`." This prevents LAN-accessible servers from accepting interaction commands from arbitrary devices.
- **Password masking**: `<input type="password">` values are always reported as `"********"` in snapshots.
- **Session auth context**: Interactions execute in the browser's current session. If the user is logged in, agent actions are authenticated as that user. This is expected behavior — the agent is acting on behalf of the developer.
- **No cross-origin**: Can only interact with content served by the Vertz dev server.

## Manifesto Alignment

**AI agents are first-class users (Principle 3):** This feature exists specifically to close the agent-browser gap. Agents can verify their UI work end-to-end without leaving the MCP connection.

**One way to do things (Principle 2):** Instead of agents needing Playwright MCP + browser MCP + manual screenshot analysis, there's one tool: the Vertz dev server MCP.

**If it builds, it works (Principle 1):** The interaction tools let agents verify that their code *works at runtime*, not just that it compiles. Combined with `vertz_get_errors`, agents can verify compilation AND behavior.

**No ceilings (Principle 8):** We're not limited by what generic browser automation tools provide. Our snapshot includes Vertz-specific data — component names, signal state, custom actions — that Playwright can never expose.

**Performance is not optional (Principle 7):** Zero overhead when no agent is connected. The interaction runtime only activates when a control session exists. Snapshot collection is lazy and cached.

## Non-Goals

- **Visual regression testing** — No screenshots. The structured snapshot is more useful to agents than pixels.
- **Multi-tab orchestration** — One session controls one tab. Agents wanting to test multi-tab scenarios should use separate sessions.
- **Record/replay** — No macro recording. Each interaction is explicit and immediate.
- **Replacing Playwright for E2E tests** — This is for agent-driven development, not CI test suites. E2E tests should still use `@vertz/test` with the DOM shim or Playwright.
- **Cross-origin interaction** — Only works with the Vertz app served by the dev server. Can't interact with iframes from other origins.
- **Drag-and-drop** — Complex pointer interaction sequences are deferred. Basic click/type/select/submit covers 90% of agent needs.
- **Direct custom action invocation** — v1 exposes custom actions in the snapshot for discovery only. Agents trigger them via DOM interactions. Direct callback invocation (with typed arguments) is future work.
- **Scroll control** — The snapshot includes ALL interactive elements regardless of viewport. No need for scroll tools — elements below the fold are still discoverable and interactable.

## Unknowns

1. **Snapshot size for complex pages** — A page with 200+ interactive elements could produce a large snapshot. Resolution: default `maxElements: 50` with pagination. Agent can increase if needed. State inspector already caps at 2MB — we follow the same pattern.

2. **Timing of snapshot collection after interaction** — Microtask + rAF + 250ms settle covers synchronous cascades. For async operations, the snapshot includes `settled: false` with pending query keys, and the agent uses `vertz_browser_wait`. To be validated during Phase 1 implementation.

## Type Flow Map

Not applicable — this feature is Rust (MCP tools) + JavaScript (browser runtime). No TypeScript generics flow.

## E2E Acceptance Test

### Agent workflow: create a task via the UI

```
1. Agent starts dev server for a task management app

2. Agent: vertz_browser_connect()          // auto-connect, single tab
   → { sessionId: "sess-x1y2", tab: { id: "tab-a1b2", url: "/", ... }, snapshot: { ... } }

3. Agent: vertz_browser_click({ target: { text: "New Task" } })
   → { ok: true, snapshot: { url: "/tasks/new", elements: [
        { ref: "title", tag: "input", name: "title", type: "text", value: "", label: "Title" },
        { ref: "priority", tag: "select", name: "priority", value: "medium",
          options: [{ value: "low", text: "Low" }, { value: "medium", text: "Medium" }, { value: "high", text: "High" }],
          label: "Priority" },
        { ref: "e3", tag: "button", text: "Create Task", type: "submit" }
      ], forms: [{ ref: "f1", fields: ["title", "priority"] }] } }

4. Agent: vertz_browser_fill_form({ target: "f1", data: { title: "Test task", priority: "high" } })
   → { ok: true, snapshot: { elements: [
        { ref: "title", tag: "input", name: "title", value: "Test task", ... },
        { ref: "priority", tag: "select", name: "priority", value: "high", ... },
      ...] } }

5. Agent: vertz_browser_submit({ target: "f1" })
   → { ok: true, navigation: { from: "/tasks/new", to: "/tasks" }, snapshot: { ... } }

6. Agent: vertz_browser_snapshot()
   → Contains element with text "Test task" in the task list

7. Agent: vertz_browser_disconnect({ sessionId: "sess-x1y2" })
   → { released: true }
```

### Invalid usage

```typescript
// Error response — no tabs connected
vertz_browser_connect()
// → { ok: false, error: "No browser tabs connected. Open the app in a browser first." }

// Error response — ambiguous auto-connect (multiple tabs)
vertz_browser_connect()  // with 3 tabs open
// → { ok: false, error: "3 tabs connected. Specify tabId. Call vertz_browser_list_tabs to see them." }

// Error response — session doesn't exist
vertz_browser_click({ sessionId: "invalid", target: "e1" })
// → { ok: false, error: "Session 'invalid' not found. Call vertz_browser_connect first." }

// Error response — tab not connected
vertz_browser_connect({ tabId: "nonexistent" })
// → { ok: false, error: "No browser tab with ID 'nonexistent'. Call vertz_browser_list_tabs to see connected tabs." }

// Error response — element not found
vertz_browser_click({ target: "e999" })
// → { ok: false, error: "Element ref 'e999' not found. The page may have changed — call vertz_browser_snapshot to refresh." }

// Error response — timeout
vertz_browser_click({ target: "e1" })  // tab frozen
// → { ok: false, error: "Browser did not respond within 10s. The tab may be frozen or disconnected." }
```

### Updated agent verification workflow

After making a UI change, the recommended agent workflow becomes:

1. `vertz_get_errors` — verify no compilation/type errors
2. `vertz_render_page` — verify SSR output is correct
3. `vertz_browser_connect` + `vertz_browser_snapshot` — verify live page state
4. `vertz_browser_click`/`type`/`fill_form`/`submit` — verify interactive behavior
5. `vertz_browser_disconnect` — release the tab

## Implementation Scope

### Target: Rust dev server only

This feature targets the Rust runtime dev server (`native/vtz/`) only. The Bun-based dev server (`packages/ui-server/src/bun-dev-server.ts`) is not in scope — the Rust runtime is the primary dev server going forward, and all new MCP capabilities land there first.

### Complexity Assessment

| Component | Effort | Notes |
|-----------|--------|-------|
| `BrowserInteractionHub` (Rust) | **Medium-High** | New struct with `HashMap<TabId, mpsc::Sender>`, `HashMap<SessionId, TabId>`, `HashMap<RequestId, oneshot::Sender>`. Per-connection read loops, session lifecycle, timeout management. ~200 lines of Rust. This is the hardest part. |
| `/__vertz_interact` WebSocket endpoint (Rust) | Low | Follow existing `/__vertz_hmr` pattern for endpoint setup |
| MCP tool definitions + `execute_tool` handlers (Rust) | Low | 9 tools following existing pattern in `mcp.rs` |
| Browser-side interaction runtime (JS) | Medium | DOM walking, event dispatch, snapshot serialization, MutationObserver caching, settle detection. Injected alongside HMR client. ~300 lines. |
| `__on` metadata extension (TS + minor compiler) | Low | 3-line `WeakMap` registration in `events.ts`, small compiler tweak for 4th arg on prop-forwarded callbacks |
| Snapshot collection + serialization | Medium | Performance-sensitive: combined `querySelectorAll`, `WeakMap` caching, `maxElements` cap, password masking |

## POC Results

No POC needed — the architecture builds directly on proven patterns:
- `vertz_navigate` already sends commands to the browser via HMR WebSocket
- State inspector already does browser → server communication via the error channel WebSocket
- `@vertz/ui/test/interactions` already has the exact DOM interaction functions (click, type, fillForm, submitForm)
- Tab identity via `sessionStorage` is a well-established browser pattern
- The only new capability is gluing these together with session management and a dedicated WebSocket channel
