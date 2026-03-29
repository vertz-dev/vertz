# Phase 5: File Watcher + Module Graph + HMR

**Prerequisites:** Phase 3 (compilation), Phase 4a (client-only rendering) complete. Does NOT require Phase 4b (SSR).

**Goal:** File changes trigger instant recompilation and browser updates without page reload or server restart. This is the core DX feature.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.5

---

## Context — Read These First

- Current HMR: `packages/ui-server/src/bun-plugin/fast-refresh-runtime.ts`
- Current Fast Refresh codegen: `packages/ui-server/src/bun-plugin/fast-refresh-codegen.ts`
- HMR protocol (existing): `packages/ui-server/src/bun-dev-server.ts` (WebSocket section)

---

## Tasks

### Task 1: File watcher with debounce

**What to do:**
- Use `notify` crate (v6.x) to watch `src/` directory recursively
- Debounce: 20ms (configurable via config)
- Filter: only `.ts`, `.tsx`, `.css` files trigger events
- Ignore: `node_modules/`, `.vertz/`, hidden files
- On change event: emit `(event_type, file_path)` to a tokio channel

**Files to create:**
```
native/vertz-runtime/src/watcher/
├── mod.rs
└── file_watcher.rs       # NEW — notify watcher + debounce + filtering
```

**Acceptance criteria:**
- [ ] Saving a `.tsx` file emits a change event within 20ms
- [ ] Saving a `.css` file emits a change event
- [ ] Saving a `.json` file does NOT emit a change event (filtered)
- [ ] Rapid saves (< 20ms apart) are debounced into one event
- [ ] `node_modules/` changes are ignored
- [ ] Watcher cleans up on server shutdown (no leaked file handles)

---

### Task 2: Module graph construction

**What to do:**
- Build a directed graph of module dependencies from compilation metadata
- When a file is compiled, record its imports as edges in the graph
- `HashMap<PathBuf, ModuleNode>` where `ModuleNode` has: `dependents: Vec<PathBuf>`, `dependencies: Vec<PathBuf>`
- Update the graph incrementally as files are compiled
- New files: added to graph on first compilation

**Files to create:**
```
native/vertz-runtime/src/watcher/
└── module_graph.rs       # NEW — import graph + queries
```

**Acceptance criteria:**
- [ ] After compiling `app.tsx` which imports `Button.tsx`, graph has edge `Button → app` (dependent)
- [ ] `get_dependents("Button.tsx")` returns `["app.tsx"]`
- [ ] Adding a new import updates the graph
- [ ] Removing an import updates the graph (on recompilation)
- [ ] Circular dependencies don't cause infinite loops

---

### Task 3: Cache invalidation cascade

**What to do:**
- On file change: invalidate the changed file's cache entry
- Walk the module graph upward: invalidate all transitive dependents
- Collect the full set of invalidated modules (for HMR notification)
- The invalidated modules will be recompiled on next request

**Files to modify:**
```
native/vertz-runtime/src/compiler/cache.rs    # MODIFY — add invalidation method
native/vertz-runtime/src/watcher/mod.rs       # MODIFY — wire change → invalidation
```

**Acceptance criteria:**
- [ ] Changing `utils.ts` invalidates `utils.ts` + all files that import it
- [ ] Transitive dependents are invalidated (A imports B imports C; changing C invalidates A, B, C)
- [ ] Files not in the dependency chain are NOT invalidated
- [ ] The set of invalidated file paths is returned for HMR

---

### Task 4: WebSocket HMR server

**What to do:**
- Add WebSocket endpoint at `/__vertz_hmr` using axum's built-in WebSocket support
- Track connected clients in a `Vec<WebSocketSender>`
- On client connect: send `{ "type": "connected" }`
- Implement broadcast function: send a message to all connected clients

**Files to create:**
```
native/vertz-runtime/src/hmr/
├── mod.rs
├── protocol.rs           # NEW — HMR message types (JSON serializable)
└── websocket.rs          # NEW — WS server + client management
```

**Acceptance criteria:**
- [ ] Client can connect to `ws://localhost:3000/__vertz_hmr`
- [ ] Client receives `{ "type": "connected" }` on connect
- [ ] Server can broadcast to all connected clients
- [ ] Disconnected clients are cleaned up (no memory leak)
- [ ] Multiple clients can connect simultaneously

---

### Task 5: HMR update flow (file change → browser update)

**What to do:**
- Wire the full flow: file change → invalidate cache → determine affected modules → broadcast HMR update
- HMR update message: `{ "type": "update", "modules": ["/src/components/Button.tsx"], "timestamp": 123 }`
- For entry file changes: send `{ "type": "full-reload", "reason": "entry file changed" }`
- For CSS-only changes: send `{ "type": "css-update", "file": "/src/components/Button.css" }`

**Files to modify:**
```
native/vertz-runtime/src/watcher/mod.rs   # MODIFY — wire change → HMR broadcast
native/vertz-runtime/src/hmr/mod.rs       # MODIFY — update broadcast logic
```

**Acceptance criteria:**
- [ ] Saving a component file sends `update` message with the file path
- [ ] Saving a file imported by 3 components sends `update` with all 3 + the changed file
- [ ] Saving the entry file sends `full-reload`
- [ ] Saving a CSS file sends `css-update`
- [ ] Messages include a timestamp for cache-busting

---

### Task 6: Client-side HMR runtime

**What to do:**
- Create `hmr-client.js` — loaded in the browser via `<script>` in the HTML shell
- Responsibilities:
  - Connect to `ws://localhost:{port}/__vertz_hmr`
  - On `update`: dynamic `import('/src/Button.tsx?t=<timestamp>')` for each module
  - On `full-reload`: `location.reload()`
  - On `css-update`: swap `<link>` tag `href` with cache-bust query
  - On disconnect: show subtle "disconnected" indicator, auto-reconnect with backoff

**Files to create:**
```
native/vertz-runtime/src/assets/
└── hmr-client.js         # NEW — browser HMR runtime
```

**Acceptance criteria:**
- [ ] Client connects to WebSocket on page load
- [ ] On `update` message, client fetches new module version
- [ ] On `full-reload`, page reloads
- [ ] On `css-update`, CSS swaps without page reload
- [ ] On disconnect, shows indicator and auto-reconnects
- [ ] Reconnection uses exponential backoff (100ms, 200ms, 400ms...)

---

### Task 7: Fast Refresh integration

**What to do:**
- The Fast Refresh runtime is already compiled into components (via `fast_refresh.rs` in the native compiler)
- It uses `globalThis[Symbol.for('vertz:fast-refresh')]` to register/update components
- After a new module is loaded (via dynamic import), the Fast Refresh registry re-mounts affected component instances, preserving signal state
- Load the Fast Refresh runtime as a client-side module (before the app)
- Wire: `import()` new module → Fast Refresh detects updated factories → re-mount

**Files to modify:**
```
native/vertz-runtime/src/assets/hmr-client.js     # MODIFY — add Fast Refresh trigger
native/vertz-runtime/src/server/html_shell.rs      # MODIFY — add Fast Refresh runtime script
```

**Acceptance criteria:**
- [ ] Changing a component's JSX updates it in the browser without reload
- [ ] Component signal state is preserved across HMR updates (e.g., counter value doesn't reset)
- [ ] Adding a new component and importing it works without restart
- [ ] Fast Refresh handles: renamed components, new components, removed components

---

### Task 8: SSR module invalidation

**What to do:**
- On file change, also invalidate the V8 module cache for SSR
- Next SSR request will use freshly compiled modules
- No V8 Isolate restart needed — just evict cached modules

**Files to modify:**
```
native/vertz-runtime/src/watcher/mod.rs       # MODIFY — also invalidate SSR cache
native/vertz-runtime/src/runtime/js_runtime.rs # MODIFY — add module cache eviction
```

**Acceptance criteria:**
- [ ] After changing a component, next page load gets fresh SSR output
- [ ] SSR module invalidation doesn't require V8 Isolate restart
- [ ] SSR continues working during HMR (no downtime between invalidation and recompilation)

---

### Task 9: HMR visual feedback

**What to do:**
- Connection indicator: subtle colored dot in corner (green = connected, yellow = reconnecting, red = disconnected)
- Update notification: brief toast "Updated (3ms)" on successful HMR, auto-dismiss after 1.5s
- Full-reload notification: "Full reload" toast
- Keep it minimal — should not distract from development

**Files to modify:**
```
native/vertz-runtime/src/assets/hmr-client.js  # MODIFY — add visual indicators
```

**Acceptance criteria:**
- [ ] Green dot visible when connected
- [ ] Yellow dot during reconnection
- [ ] Red dot when disconnected
- [ ] "Updated (Xms)" toast on hot update
- [ ] Indicators don't interfere with app layout (positioned absolutely, high z-index)

---

### Task 10: End-to-end HMR test with example app

**What to do:**
- Start the dev server with task-manager example
- Edit a component file
- Verify the browser updates without reload
- Verify signal state is preserved

**Acceptance criteria:**
- [ ] Edit `TaskCard.tsx` → component updates in browser
- [ ] Edit a shared utility → all consuming components update
- [ ] Create a new component, import it → works without restart
- [ ] Delete an import → module graph updates correctly
- [ ] 10 consecutive rapid saves all produce correct updates (stress test)

---

## Quality Gates

```bash
cd native && cargo test -p vertz-runtime
```

---

## Notes

- This is the highest-DX-value phase. Take time to get it right.
- Fast Refresh already exists in the compiler output — the work here is wiring it to the new HMR channel.
- The key difference from Bun: we own the module graph. No stale-graph bugs possible.
- 20ms debounce matches Vite. If editors batch saves differently, make configurable.
