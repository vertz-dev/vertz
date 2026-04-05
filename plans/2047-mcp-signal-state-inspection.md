# MCP Signal/State Inspection — Design Doc

**Issue:** #2047
**Author:** Claude Opus 4.6
**Status:** Draft (Rev 2 — addresses DX, Product, and Technical review findings)
**Estimated effort:** XL (4–5 weeks)
**Dependencies:**
- Fast Refresh runtime (complete)
- HMR WebSocket — server-to-client (complete); bidirectional extension is Phase 2 of this feature
- MCP server (complete — 7 existing tools)

---

## Overview

Add an MCP tool `vertz_get_state` that gives LLM agents visibility into the live reactive state of components. Given a component name, it returns a structured JSON snapshot of all signal values and query states for every mounted instance.

This closes the "LLMs can't see runtime state" gap identified in Section 2.2 of `plans/vertz-dev-server/next-steps.md`.

> **When to use this tool vs `vertz_render_page`:** Use `vertz_get_state` to debug why a component shows incorrect data or behaves unexpectedly (reactive state). Use `vertz_render_page` for visual layout issues (HTML/CSS).

---

## 1. API Surface

### MCP Tool Definition

```json
{
  "name": "vertz_get_state",
  "description": "Get the reactive state (signals, query states) of mounted component instances. Use this to debug why a component shows incorrect data or behaves unexpectedly. For visual layout issues, use vertz_render_page instead. Returns a structured JSON snapshot without needing console.log.",
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

### Response — All Components (no filter)

```json
{
  "content": [{
    "type": "text",
    "text": "<valid JSON — see StateSnapshot shape below>"
  }]
}
```

The `text` field always contains valid, parseable JSON. Parsed result:

```json
{
  "components": [
    {
      "name": "TaskCard",
      "moduleId": "/src/components/TaskCard.tsx",
      "instanceCount": 3,
      "instances": [
        {
          "index": 0,
          "key": "task-1",
          "signals": {
            "isEditing": false,
            "title": "Fix auth bug"
          },
          "queries": {
            "taskQuery": {
              "data": { "id": "t1", "title": "Fix auth bug" },
              "loading": false,
              "revalidating": false,
              "error": null,
              "idle": false,
              "key": "task-t1"
            }
          }
        }
      ]
    }
  ],
  "totalInstances": 3,
  "connectedClients": 1,
  "timestamp": "2026-04-05T12:34:56.789Z"
}
```

### Response — No Mounted Instances (component is registered)

```json
{
  "components": [],
  "totalInstances": 0,
  "connectedClients": 1,
  "timestamp": "2026-04-05T12:34:56.789Z",
  "message": "TaskCard is registered (in /src/components/TaskCard.tsx) but has 0 mounted instances on the current page. Navigate to a page that renders it."
}
```

### Response — No Mounted Instances (component not in registry)

```json
{
  "components": [],
  "totalInstances": 0,
  "connectedClients": 1,
  "timestamp": "2026-04-05T12:34:56.789Z",
  "message": "TaskCard is not in the component registry. Check the name spelling or ensure the file has been loaded."
}
```

### Response — No Connected Browser

```json
{
  "content": [{
    "type": "text",
    "text": "No browser clients connected to the HMR WebSocket. Open the app in a browser first."
  }],
  "isError": true
}
```

### State Snapshot Shape (TypeScript for reference)

```typescript
interface StateSnapshot {
  components: ComponentSnapshot[];
  totalInstances: number;
  connectedClients: number;
  timestamp: string; // ISO 8601
  message?: string;
}

interface ComponentSnapshot {
  name: string;
  moduleId: string;
  instanceCount: number;
  instances: InstanceSnapshot[];
}

interface InstanceSnapshot {
  /** DOM order index within this component's instances. */
  index: number;
  /** JSX key prop if the instance was rendered in a list. */
  key?: string;
  signals: Record<string, SerializedValue>;
  queries: Record<string, QuerySnapshot>;
}

interface QuerySnapshot {
  data: SerializedValue;
  loading: boolean;
  revalidating: boolean;
  error: SerializedValue;
  idle: boolean;
  key?: string;
}

// Serialization rules:
// - Primitives (string, number, boolean, null) → as-is
// - undefined → null (JSON doesn't support undefined)
// - Plain objects/arrays → JSON-serialized (max depth 4, truncated as "[Object: N keys]" / "[Array: N items]")
// - Functions → "[Function: name]" (or "[Function]" if anonymous)
// - DOM nodes → "[HTMLElement: tagName]"
// - Symbols → "[Symbol: description]"
// - Circular references → "[Circular]"
// - Date → ISO string
// - Map → "[Map: N entries]"
// - Set → "[Set: N items]"
// - Error → { name, message }
// - Promise → "[Promise]"
// - WeakRef/WeakMap/WeakSet → "[WeakRef]" / "[WeakMap]" / "[WeakSet]"
// - ArrayBuffer/TypedArray → "[ArrayBuffer: N bytes]"
type SerializedValue = string | number | boolean | null | object;
```

---

## 2. Manifesto Alignment

### Principle 3: AI agents are first-class users

This feature is a **direct enabler** for Principle 3. Today, LLMs debugging reactive state must ask the developer to add `console.log` statements, read terminal output, and iterate. `vertz_get_state` gives agents direct programmatic access to signal values — the same kind of "eyes into the runtime" that a human developer gets from browser DevTools.

### Principle 2: One way to do things

Follows the `vertz_get_*` naming convention established by the existing 5 get-tools. `component` parameter accepts only a component function name (case-sensitive string) — one input format, no ambiguity between names and paths.

### Principle 7: Performance is not optional

State inspection runs on-demand (MCP tool call), not continuously. The client-side script is injected only during dev mode and does no work until a snapshot is requested. Walking the Fast Refresh registry is O(components × instances) — bounded by what's mounted on the current page. Response size is capped at 2 MB to prevent oversized WebSocket messages. Serialization uses `.peek()` (untracked read) to avoid creating spurious reactive subscriptions. Each `.peek()` is wrapped in try/catch because `.peek()` on a dirty `ComputedImpl` triggers recomputation of the derivation function, which could throw.

### Tradeoffs Accepted

- **Explicit over implicit**: The tool requires an explicit MCP call — no background state streaming. The agent decides when to inspect, not the framework.
- **Convention over configuration**: One way to inspect state. No alternative APIs, no browser extension, no custom hooks. MCP is the single interface for LLM tooling.
- **Dev-only**: State inspection is only available in the dev server, accessible only from localhost, with the same trust model as browser DevTools.

### What Was Rejected

- **Continuous state streaming via MCP events**: Would create noise. Agents should pull state when needed, not be firehosed with every signal change.
- **Server-side state mirroring**: Maintaining a server-side copy of browser signal state adds complexity and staleness risk. The browser is the source of truth.
- **Custom V8 op for state walking**: The component registry lives in the browser, not the server-side isolate. A V8 op would only work for SSR context, missing the primary use case (live client state).
- **File path as filter input**: Accepting both component names and file paths creates ambiguity (relative vs absolute, with/without extension). Component names are sufficient — LLMs editing code already know the function name.

---

## 3. Non-Goals

- **State mutation via MCP**: This tool is read-only. Changing signal values from the MCP tool is out of scope (and a security risk).
- **Computed value exposure**: Computed values are not collected by the signal collector and cannot be exposed without adding a collection stack. Deferred to a follow-up. Computed values are derived from signals — exposing all signal values is sufficient for debugging.
- **Historical state tracking / time-travel**: No signal change history. Each call returns a point-in-time snapshot. Use `timestamp` to compare successive calls.
- **Production runtime inspection**: Dev-only. The inspector script is not bundled in production builds.
- **Component tree visualization**: This returns flat state snapshots, not a hierarchical component tree. Tree visualization is a separate future tool.
- **Sensitive data filtering (allowlist/blocklist)**: Deferred. The open question from next-steps.md (line 496) about filtering auth tokens/API keys is out of scope for this initial implementation. All signal values are exposed as-is. In dev mode, the developer already has access to all state via browser DevTools. The MCP endpoint is localhost-only, same trust model.
- **SSR isolate state inspection**: The server-side V8 isolate doesn't maintain persistent component instances. State inspection targets the browser only.
- **Targeted multi-tab inspection**: In multi-tab scenarios, the first responding tab wins. Targeting a specific tab by URL or clientId is deferred.

---

## 4. Unknowns

### Resolved

1. **Where does component state live?**
   → In the browser, on `globalThis[Symbol.for('vertz:fast-refresh:registry')]`. The Fast Refresh registry maps `moduleId → componentName → ComponentRecord`, where each record has an `instances` array with signal refs.

2. **How to get state from browser to MCP handler?**
   → WebSocket request/response over the existing HMR connection. Server sends `inspect-state` command, client responds with `state-snapshot`. This avoids new HTTP endpoints and reuses the existing transport.

3. **How to identify query signals vs regular signals?**
   → Query signals are created inside `query()` (in `query.ts`) as standard `signal()` calls **without `_hmrKey`**. Regular component signals get `_hmrKey` set by the compiler (the variable name, e.g., `'count'`). To group query signals, we add a lightweight `_queryGroup: string` property to each signal created by `query()`. The `_queryGroup` value is the query's cache key. The state inspector checks `_queryGroup` to aggregate signals into named query snapshots.

   **Required change to `@vertz/ui`**: In `packages/ui/src/query/query.ts`, after each `signal()` call, set `(sig as any)._queryGroup = cacheKey`. This is a dev-mode-only annotation — no runtime cost in production (tree-shaken or guarded by `__DEV__`).

4. **Are computed values collected by the signal collector?**
   → **No.** Only `signal()` calls push to the signal collection stack. `computed()` does not. Exposing computed values would require adding a parallel computed collection stack + compiler changes. This is deferred as a non-goal for v1.

5. **Signal naming**: Signals created via `let x = value` get `_hmrKey = 'x'` from the compiler. Signals created inside `query()` have no `_hmrKey` (they get positional names like `signal_0`). With `_queryGroup`, query signals are grouped under their query name instead of appearing as unnamed signals.

6. **Multi-client behavior**: If multiple browser tabs are connected, all receive the `inspect-state` command and all respond. The server uses the **first response** and discards the rest (oneshot channel is consumed on first send). This is non-deterministic but acceptable for dev workflows. Known limitation documented in Non-Goals.

### Unresolved

None — all unknowns resolved during design review.

---

## 5. POC Results

No POC needed. The building blocks are proven:
- Fast Refresh registry already tracks component instances with signal refs (shipped in production)
- HMR WebSocket is stable and used for navigate commands
- MCP tool handler pattern is established with 7 existing tools
- `.peek()` on signals is the documented untracked read API

The main new work is making the WebSocket bidirectional (client → server messages), writing the serialization logic, and adding `_queryGroup` markers to query signals.

---

## 6. Type Flow Map

This feature spans Rust + JavaScript with JSON as the wire format. There are no TypeScript generics flowing through the system — the types are structural (JSON shapes).

### Wire Format Flow

```
Browser (JS)                    Server (Rust)                  MCP Client (LLM)
────────────────��───────────────────────────���────────────────────────────────────
                                MCP tools/call
                                  { name: "vertz_get_state",
                                    arguments: { component?: string } }
                                         │
                                         ▼
                                execute_tool() in mcp.rs
                                  1. Check hmr_hub.client_count() > 0
                                  2. Generate requestId (UUID)
                                  3. Register oneshot in
                                     DevServerState.pending_inspections
                                  4. Broadcast HmrMessage::InspectState
                                  5. Await oneshot (5s timeout)
                                  6. On timeout: remove entry, return error
                                         │
                                         ▼ HmrMessage::InspectState
                                         │ (WebSocket JSON)
         ◄─────────���─────────────────────┘
         │
         ▼
state-inspector.ts (browser)
  { type: "inspect-state",
    requestId: string,
    filter?: string }
         │
         ▼ Walk Fast Refresh registry
         │ Serialize via safeSerialize()
         │ Cap response at 2 MB
         │
         ▼
  { type: "state-snapshot",
    requestId: string,
    snapshot: StateSnapshot }
         │
         ▼ WebSocket message (client → server)
         └───────────��───────────────────►
                                         │
                                         ▼
                                client_message.rs: parse ClientMessage
                                DevServerState: lookup pending_inspections
                                  .remove(requestId) → oneshot::Sender
                                  sender.send(snapshot)
                                         │
                                         ▼
                                MCP handler resumes, formats response
                                  { content: [{ type: "text", text: "..." }] }
```

### Rust Types

```rust
// hmr/protocol.rs — add InspectState to existing HmrMessage enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum HmrMessage {
    // ... existing variants (Connected, Update, FullReload, CssUpdate, Navigate) ...

    /// Request component state inspection from connected browser.
    #[serde(rename = "inspect-state")]
    InspectState {
        #[serde(rename = "requestId")]
        request_id: String,
        /// Optional component function name filter (case-sensitive).
        filter: Option<String>,
    },
}

// hmr/client_message.rs — NEW file for client → server messages
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "state-snapshot")]
    StateSnapshot {
        #[serde(rename = "requestId")]
        request_id: String,
        snapshot: serde_json::Value,
    },
}

// server/module_server.rs — add to DevServerState
pub struct DevServerState {
    // ... existing fields ...

    /// Pending state inspection requests. Key: requestId, Value: oneshot sender.
    /// Type: Arc<tokio::sync::Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>
    pub pending_inspections: Arc<tokio::sync::Mutex<
        HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>
    >>,
}
```

### JavaScript Types (state-inspector.ts)

```typescript
// Injected into the browser during dev — compiled .ts, not a raw .js file
function collectStateSnapshot(filter?: string): StateSnapshot { ... }
function safeSerialize(value: unknown, depth?: number, seen?: WeakSet<object>): SerializedValue { ... }
```

---

## 7. E2E Acceptance Test

```typescript
describe('Feature: MCP state inspection', () => {
  describe('Given a running dev server with mounted components', () => {
    describe('When vertz_get_state is called with no filter', () => {
      it('Then returns snapshots for all mounted components', async () => {
        const response = await mcpCall('vertz_get_state', {});
        const snapshot = JSON.parse(response.content[0].text);

        expect(snapshot.components.length).toBeGreaterThan(0);
        expect(snapshot.totalInstances).toBeGreaterThan(0);
        expect(snapshot.connectedClients).toBe(1);
        expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        const taskCard = snapshot.components.find(
          (c: { name: string }) => c.name === 'TaskCard',
        );
        expect(taskCard).toBeDefined();
        expect(taskCard.instances.length).toBeGreaterThan(0);
        expect(taskCard.instances[0]).toHaveProperty('index');
        expect(taskCard.instances[0]).toHaveProperty('signals');
      });
    });
  });

  describe('Given a component with reactive signals', () => {
    describe('When vertz_get_state is called with component filter', () => {
      it('Then returns signal values as plain JSON (not Signal objects)', async () => {
        const response = await mcpCall('vertz_get_state', {
          component: 'TaskCard',
        });
        const snapshot = JSON.parse(response.content[0].text);
        const instance = snapshot.components[0].instances[0];

        expect(typeof instance.signals.isEditing).toBe('boolean');
        // Functions serialized with name
        // DOM nodes serialized as "[HTMLElement: tagName]"
        // No circular references
      });
    });
  });

  describe('Given a component with query state', () => {
    describe('When vertz_get_state is called', () => {
      it('Then returns query data, loading, error, idle, and key', async () => {
        const response = await mcpCall('vertz_get_state', {
          component: 'TaskList',
        });
        const snapshot = JSON.parse(response.content[0].text);
        const instance = snapshot.components[0].instances[0];
        const query = instance.queries.tasks;

        expect(query).toBeDefined();
        expect(query).toHaveProperty('data');
        expect(query).toHaveProperty('loading');
        expect(query).toHaveProperty('revalidating');
        expect(query).toHaveProperty('error');
        expect(query).toHaveProperty('idle');
        expect(typeof query.loading).toBe('boolean');
        expect(typeof query.revalidating).toBe('boolean');
      });
    });
  });

  describe('Given no matching component is mounted (but registered)', () => {
    describe('When vertz_get_state is called', () => {
      it('Then returns message indicating component is registered but not mounted', async () => {
        const response = await mcpCall('vertz_get_state', {
          component: 'SettingsPanel',
        });
        const snapshot = JSON.parse(response.content[0].text);

        expect(snapshot.components).toEqual([]);
        expect(snapshot.totalInstances).toBe(0);
        expect(snapshot.message).toContain('registered');
        expect(snapshot.message).toContain('0 mounted instances');
      });
    });
  });

  describe('Given component name not in registry at all', () => {
    describe('When vertz_get_state is called', () => {
      it('Then returns message about component not being in registry', async () => {
        const response = await mcpCall('vertz_get_state', {
          component: 'NonExistentComponent',
        });
        const snapshot = JSON.parse(response.content[0].text);

        expect(snapshot.components).toEqual([]);
        expect(snapshot.message).toContain('not in the component registry');
      });
    });
  });

  describe('Given no browser is connected', () => {
    describe('When vertz_get_state is called', () => {
      it('Then returns an error about no connected clients', async () => {
        const response = await mcpCall('vertz_get_state', {});

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('No browser clients');
      });
    });
  });
});
```

---

## Architecture

### Key Files (New / Modified)

| File | Change |
|------|--------|
| `packages/ui/src/query/query.ts` | Add `_queryGroup` marker to signals created by `query()` |
| `packages/ui-server/src/bun-plugin/state-inspector.ts` | **New**: client-side state collection, serialization, WebSocket handler |
| `packages/ui-server/src/bun-plugin/__tests__/state-inspector.test.ts` | **New**: unit tests for serialization and registry walking |
| `native/vtz/src/hmr/protocol.rs` | Add `InspectState` variant to `HmrMessage` |
| `native/vtz/src/hmr/client_message.rs` | **New**: `ClientMessage` enum for client → server messages |
| `native/vtz/src/hmr/mod.rs` | Export `client_message` module |
| `native/vtz/src/hmr/websocket.rs` | Parse incoming client messages, route to `DevServerState.pending_inspections` |
| `native/vtz/src/server/module_server.rs` | Add `pending_inspections` field to `DevServerState` |
| `native/vtz/src/server/mcp.rs` | Add `vertz_get_state` tool definition and handler |

### Client Message Routing

The `handle_connection` method in `websocket.rs` currently ignores all incoming client messages (line 83: `_ => {}`). The change:

```rust
// Before: _ => {}
// After:
Ok(Message::Text(text)) => {
    if let Ok(msg) = serde_json::from_str::<ClientMessage>(&text) {
        match msg {
            ClientMessage::StateSnapshot { request_id, snapshot } => {
                let mut pending = pending_inspections.lock().await;
                if let Some(sender) = pending.remove(&request_id) {
                    let _ = sender.send(snapshot);
                }
            }
        }
    }
}
```

The `pending_inspections` map is passed into `handle_connection` as a cloned `Arc<Mutex<...>>` — keeping `HmrHub` itself unaware of MCP concerns.

### Injection

The `state-inspector.ts` script is injected into the browser alongside `fast-refresh-runtime.ts` — via the same Bun plugin mechanism. It registers a message handler on the HMR WebSocket (`__vertz_hmr`) to listen for `inspect-state` commands. Zero overhead when no inspection is requested.

---

## Implementation Phases

### Phase 1: Query Markers + Client-Side State Collection

**Goal:** Build and test the browser-side state collection logic.

**Tasks:**
1. Add `_queryGroup` marker to query signals in `packages/ui/src/query/query.ts` (guarded by `__DEV__`)
2. Build `state-inspector.ts`:
   - `safeSerialize()` — depth-limited serializer handling all edge cases (functions w/ name, DOM, Date, Map, Set, Error, Promise, WeakRef, circular refs, ArrayBuffer)
   - `collectStateSnapshot(filter?)` — walks Fast Refresh registry, reads signals via `.peek()` (wrapped in try/catch), groups query signals by `_queryGroup`, respects 2 MB size cap
   - Distinguishes "registered but not mounted" vs "not in registry" for error messages
3. Unit tests for serialization edge cases and registry walking (mock registry)

### Phase 2: Bidirectional WebSocket + MCP Tool

**Goal:** Wire up the full request/response flow from MCP to browser and back.

**Tasks:**
1. Add `InspectState` to `HmrMessage` in `protocol.rs`; create `client_message.rs` with `ClientMessage` enum
2. Add `pending_inspections: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>` to `DevServerState`
3. Modify `handle_connection` in `websocket.rs` to parse `ClientMessage` from incoming WebSocket text messages and route `StateSnapshot` responses to `pending_inspections`
4. Add `vertz_get_state` tool definition and handler in `mcp.rs`:
   - Check `client_count > 0` → error if no browser
   - Generate UUID requestId
   - Insert oneshot in `pending_inspections`
   - Broadcast `HmrMessage::InspectState`
   - Await oneshot with 5s timeout
   - On timeout: `.remove(requestId)` from map, return timeout error
   - On success: format as MCP response
5. Inject `state-inspector.ts` in the Bun plugin alongside `fast-refresh-runtime.ts`
6. Console logging for inspection requests/responses
7. Unit tests: protocol serialization, message routing, timeout cleanup
8. E2E integration test (`.local.ts`) with real dev server + browser

---

## Review Findings Addressed (Rev 2)

### DX Review
| Finding | Resolution |
|---------|-----------|
| BLOCKER-1: Tool name breaks `get_*` convention | Renamed to `vertz_get_state` |
| BLOCKER-2: `component` param ambiguous (name vs path) | Name-only, case-sensitive. File path dropped. |
| SHOULD-FIX-1: Response examples unreadable | Pretty-printed JSON in examples |
| SHOULD-FIX-2: No instance identity | Added `index` and `key` fields to `InstanceSnapshot` |
| SHOULD-FIX-3: No distinction registered vs not-mounted | Two distinct error messages |
| SHOULD-FIX-4: No "when to use" guidance | Added to tool description and overview |
| NICE-TO-HAVE-1: `[Function]` without name | Changed to `[Function: name]` |
| NICE-TO-HAVE-2: Depth 3 too shallow | Changed to depth 4, specified truncation format |
| NICE-TO-HAVE-3: No timestamp | Added `timestamp` field |
| NICE-TO-HAVE-4: Multi-tab undocumented | Documented as known limitation in Non-Goals |

### Product/Scope Review
| Finding | Resolution |
|---------|-----------|
| BLOCKER-1: `isLoading` vs `loading` mismatch | Using `loading` (matches codebase QueryResult API). Issue #2047 to be updated. |
| BLOCKER-2: `_queryKey` doesn't exist | Replaced with `_queryGroup` marker set by `query()` in dev mode |
| SHOULD-FIX: Dependencies header misleading | Updated to clarify bidirectional is new work |
| SHOULD-FIX: Phase 2 effort underestimated | Raised estimate to XL (4-5 weeks) |
| SHOULD-FIX: Merge Phase 4 into Phase 3 | Done — now 2 phases |
| NICE-TO-HAVE: Network exposure note | Added to Tradeoffs section |

### Technical Review
| Finding | Resolution |
|---------|-----------|
| BLOCKER-1: `pending_inspections` on wrong struct | Moved to `DevServerState`, passed as `Arc<Mutex<...>>` into `handle_connection` |
| BLOCKER-2: `_queryKey` / computed collection missing | `_queryGroup` for queries; computed values deferred as non-goal with rationale |
| SHOULD-FIX-1: `.peek()` recomputation | Wrapped in try/catch |
| SHOULD-FIX-2: Multi-client waste | Documented as known limitation; first response wins via oneshot |
| SHOULD-FIX-3: No size cap | 2 MB response cap with `truncated: true` flag |
| SHOULD-FIX-4: Timeout doesn't clean up | Explicit `.remove(requestId)` on timeout |
| SHOULD-FIX-5: `ClientMessage` in wrong file | New `client_message.rs` file |
| SHOULD-FIX-6: Thread safety unspecified | Exact type specified: `Arc<tokio::sync::Mutex<HashMap<...>>>` |
| NICE-TO-HAVE-1: Missing serialization cases | Added Date, Map, Set, Error, Promise, WeakRef, ArrayBuffer |
| NICE-TO-HAVE-2: Rust WS test strategy | Extract `parse_client_message()` as pure function for unit tests |
| NICE-TO-HAVE-3: Security note | Added localhost trust model note |
