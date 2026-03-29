# Phase 6: Auto-Recovery + Error Overlay + Zero-Restart

**Prerequisites:** Phase 5 (HMR) complete.

**Goal:** The dev server recovers from any failure state automatically. Developers never manually restart the server for source code changes.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.6

---

## Context — Read These First

- Current error handling: `packages/ui-server/src/bun-dev-server.ts` (lines 1060-1192)
- Current error overlay: `packages/ui-server/src/bun-plugin/fast-refresh-runtime.ts` (error display section)
- Error categories: `.claude/rules/dev-server-debugging.md` (Error Channel Categories)

---

## Tasks

### Task 1: Error categorization and priority system

**What to do:**
- Define error categories with priorities:
  - `build` (highest) — compilation/parse errors
  - `resolve` — module resolution failures
  - `ssr` — SSR render errors
  - `runtime` (lowest, debounced 100ms) — client runtime errors
- Higher priority errors suppress lower priority until cleared
- Each error has: category, message, file, line, column, code snippet (optional)

**Files to create:**
```
native/vertz-runtime/src/errors/
├── mod.rs
└── categories.rs         # NEW — error types + priority system
```

**Acceptance criteria:**
- [ ] Error categories are ordered by priority
- [ ] A `build` error suppresses `runtime` errors
- [ ] Clearing a `build` error allows `runtime` errors to surface
- [ ] Each error has structured fields (category, message, file, line, column)

---

### Task 2: WebSocket error broadcast channel

**What to do:**
- Add WebSocket endpoint at `/__vertz_errors` for error broadcasting
- On error: broadcast to all connected error clients
- On error clear: broadcast clear message
- Message formats:
  - `{ "type": "error", "category": "build", "errors": [...] }`
  - `{ "type": "clear" }`

**Files to create:**
```
native/vertz-runtime/src/errors/
└── broadcaster.rs        # NEW — WebSocket error broadcasting
```

**Acceptance criteria:**
- [ ] Compilation error is broadcast to connected error clients
- [ ] Error clear is broadcast when error is fixed
- [ ] Multiple error clients receive the same broadcast
- [ ] Error broadcast includes: category, message, file, line, column

---

### Task 3: Source map resolution for error stack traces

**What to do:**
- When an error occurs in compiled code, the stack trace references compiled positions
- Map compiled positions back to original source using stored source maps
- Produce a readable stack trace with original filenames and line numbers

**Files to create:**
```
native/vertz-runtime/src/errors/
└── source_mapper.rs      # NEW — compiled position → original position
```

**Acceptance criteria:**
- [ ] Runtime error in compiled code shows original `.tsx` filename
- [ ] Line numbers map correctly to original source
- [ ] Stack trace includes all frames (not just the top one)
- [ ] Unmapped frames (e.g., in node_modules) are shown as-is

---

### Task 4: Client-side error overlay

**What to do:**
- Create a JavaScript overlay that renders in the browser:
  - Floating card with error message, code snippet, clickable source location
  - Code snippet with syntax highlighting and error line highlighted
  - Multi-editor support: detect editor from `$EDITOR` env var or running processes
    - `vscode://`, `cursor://`, `webstorm://`, `zed://` URI schemes
  - Dismiss on error clear (automatic)
  - Semi-transparent backdrop
- Load via `<script>` in HTML shell, connect to `/__vertz_errors` WebSocket

**Files to create:**
```
native/vertz-runtime/src/assets/
└── error-overlay.js      # NEW — client error overlay
```

**Acceptance criteria:**
- [ ] Syntax error shows overlay with file, line, error message, code snippet
- [ ] Error line is highlighted in the code snippet
- [ ] Clicking source location opens file in editor (vscode:// URI)
- [ ] Overlay dismisses when error is fixed and file is saved
- [ ] Overlay does not interfere with working parts of the app (semi-transparent)
- [ ] Multiple errors show all of them (scrollable)

---

### Task 5: Build error auto-recovery

**What to do:**
- When a compilation error occurs: broadcast error, mark file as errored
- When the errored file is saved again: attempt recompilation
- If recompilation succeeds: clear error, resume HMR
- The developer's only action is fixing the code and saving

**Files to modify:**
```
native/vertz-runtime/src/watcher/mod.rs       # MODIFY — handle errored files
native/vertz-runtime/src/errors/broadcaster.rs # MODIFY — auto-clear on success
```

**Acceptance criteria:**
- [ ] Introduce syntax error → overlay shows
- [ ] Fix the error → overlay auto-dismisses
- [ ] App resumes with the fix applied (HMR update)
- [ ] No user action needed beyond fixing and saving
- [ ] Rapid error-fix-error-fix cycles work correctly (no stale state)

---

### Task 6: Runtime error handling

**What to do:**
- Catch uncaught exceptions during SSR rendering
- Catch HMR re-mount errors (Fast Refresh component re-execution failures)
- Map stack traces to source, broadcast via error channel
- Runtime errors are debounced (100ms) to avoid flooding during cascade failures

**Files to modify:**
```
native/vertz-runtime/src/ssr/render.rs        # MODIFY — catch and broadcast SSR errors
native/vertz-runtime/src/hmr/mod.rs           # MODIFY — catch HMR re-mount errors
```

**Acceptance criteria:**
- [ ] SSR error shows in overlay with source-mapped stack trace
- [ ] HMR error (component throws during re-mount) shows in overlay
- [ ] Multiple rapid errors are debounced (not flooding the overlay)
- [ ] Runtime errors are lower priority than build errors

---

### Task 7: V8 Isolate supervised restart

**What to do:**
- If the V8 Isolate enters an unrecoverable state:
  - Detect: execution timeout, memory limit exceeded (V8 flags), or unrecoverable error
  - Create a new `JsRuntime` (full cold start)
  - HTTP server continues running during restart
  - Broadcast `full-reload` when new Isolate is ready
- Note: OOM may abort the process (V8 behavior). This is best-effort.
- Set V8 memory limits via `--max-old-space-size` equivalent

**Files to create:**
```
native/vertz-runtime/src/hmr/
└── recovery.rs           # NEW — Isolate restart logic
```

**Acceptance criteria:**
- [ ] Execution timeout triggers Isolate restart (not process crash)
- [ ] HTTP server responds during Isolate restart ("Restarting..." message)
- [ ] New Isolate is functional within 500ms
- [ ] Clients receive `full-reload` after restart
- [ ] V8 memory limit is configurable

---

### Task 8: Config/dependency change auto-restart

**What to do:**
- Watch `vertz.config.ts`, `package.json`, lockfile, `.env`
- On change: full server restart (not just HMR)
- For config/env: restart V8 Isolate (re-read config)
- For dependencies: re-run pre-bundling, then restart
- Notify browser: "Server restarting..."

**Files to modify:**
```
native/vertz-runtime/src/watcher/file_watcher.rs  # MODIFY — watch config/dep files
native/vertz-runtime/src/server/http.rs            # MODIFY — restart flow
```

**Acceptance criteria:**
- [ ] Changing `vertz.config.ts` triggers server restart
- [ ] Changing `package.json` triggers pre-bundling + restart
- [ ] Changing `.env` triggers V8 Isolate restart (re-read env vars)
- [ ] Browser shows "Restarting..." and auto-reconnects
- [ ] App is functional after restart

---

### Task 9: WebSocket reconnection logic

**What to do:**
- Client-side: exponential backoff on disconnect (100ms, 200ms, 400ms, 800ms, 1600ms, cap at 5000ms)
- On reconnect: server sends current error state
- After 10 rapid reconnects within 30s: show "Server may be down. Check terminal." message
- Track reconnect count in `sessionStorage`

**Files to modify:**
```
native/vertz-runtime/src/assets/hmr-client.js     # MODIFY — reconnection logic
native/vertz-runtime/src/assets/error-overlay.js   # MODIFY — "server down" fallback
```

**Acceptance criteria:**
- [ ] WebSocket reconnects automatically after disconnect
- [ ] Backoff increases: 100ms → 200ms → 400ms → ... → 5000ms
- [ ] On reconnect, receives current error state
- [ ] After 10 rapid reconnects, shows "server may be down" message
- [ ] Successful reconnect resets the counter

---

### Task 10: Diagnostic endpoint

**What to do:**
- `GET /__vertz_diagnostics` returns JSON with server health:
  - Compilation cache: size, hit rate
  - Module graph: node count, edge count
  - Watcher: status, last event time
  - WebSocket: connected client count
  - Errors: current active errors
  - Pre-bundled deps: list, sizes
  - Uptime

**Files to create:**
```
native/vertz-runtime/src/server/
└── diagnostics.rs        # NEW — health endpoint
```

**Acceptance criteria:**
- [ ] `GET /__vertz_diagnostics` returns valid JSON
- [ ] Includes cache stats, graph size, client count, errors, uptime
- [ ] Response time < 10ms (no heavy computation)

---

### Task 11: End-to-end zero-restart validation

**What to do:**
- Comprehensive test: start server → break code → fix code → verify recovery → repeat with different error types
- Test each scenario:
  - Syntax error → fix → works
  - Missing import → add file → works
  - Delete a file → update imports → works
  - Break a dependency → fix → works
  - Config change → auto-restart → works
- No manual restart at any point

**Acceptance criteria:**
- [ ] All error-fix cycles work without manual restart
- [ ] Config changes trigger auto-restart
- [ ] The server runs for 30+ minutes of active development without needing restart
- [ ] Memory usage stays stable (no leaks from error-fix cycles)

---

## Quality Gates

```bash
cd native && cargo test -p vertz-runtime
```

---

## Notes

- The error overlay should be beautiful — it's what developers see most when things break
- Multi-editor support: check `$VISUAL`, `$EDITOR`, then look for running processes
- V8 Isolate restart is best-effort for OOM. Document the limitation.
- This phase is the final DX polish. After this, the server should be usable for daily development.
