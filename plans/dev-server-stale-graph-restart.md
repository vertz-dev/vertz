# Dev Server Stale-Graph Restart

**Issue:** [#1302](https://github.com/vertz-dev/vertz/issues/1302)

## Problem

When a named export is removed or renamed during development, Bun's HMR module graph retains the old import binding. Importers get a runtime error (`Export named 'X' not found in module '...'`) that persists until the developer manually restarts the dev server. This is a common workflow (rename/remove exports) and the manual restart breaks flow.

## API Surface

No new public API. All changes are internal to `@vertz/ui-server`'s dev server.

### New exports from `bun-dev-server.ts`

```ts
/**
 * Classify whether an error message indicates a stale module graph
 * that requires a server restart to resolve.
 *
 * Matches export-specific errors only (not generic resolution errors):
 * - "Export named 'X' not found in module 'Y'"
 * - "No matching export in 'Y' for import 'X'"
 * - "'Y' does not provide an export named 'X'"
 */
export function isStaleGraphError(message: string): boolean;
```

### WebSocket protocol additions

Client → Server:
```ts
{ type: 'restart' }  // Request server restart
```

Server → Client:
```ts
{ type: 'restarting' }  // Server is about to restart, prepare for reconnect
```

### Error overlay behavior change

When a stale-graph error is detected, the error overlay replaces the "Retry" button with a primary "Restart Server" button. "Retry" becomes a secondary/ghost action. The button sends `{ type: 'restart' }` via WebSocket.

## Error Flow Paths

Two distinct paths can detect stale-graph errors:

### Server-side path (console.error intercept)
```
Bun HMR re-evaluates module
  → console.error("[vertz-hmr] Error re-mounting ...")
  → server's console.error intercept (line 845)
  → broadcastError('runtime', [...])
  → WS sends { type: 'error', category: 'runtime' } to clients
  → client shows overlay with "Restart Server" button (Phase 2)
  → [Phase 3 only] if isStaleGraphError, auto-send { type: 'restart' }
```

### Client-side path (window.onerror)
```
Module evaluation fails in browser
  → window.onerror fires
  → client error channel shows overlay with "Restart Server" button (Phase 2)
  → [Phase 3 only] if isStaleGraphError, auto-send { type: 'restart' }
```

**Key:** In Phases 1-2, both paths show the manual "Restart Server" button. Phase 3 adds auto-restart on both paths. A concurrent restart guard (`isRestarting` flag) prevents double-trigger if both paths fire for the same error.

## Manifesto Alignment

- **"If it builds, it works"** — When HMR can't handle a change, the dev server should recover automatically rather than requiring manual intervention.
- **"One way to do things"** — Developers shouldn't need to know when to manually restart vs. when HMR handles it. The server should always "just work."
- **"AI agents are first-class users"** — An AI agent renaming exports during a refactor shouldn't need to know about dev server restart. Auto-recovery is critical for autonomous agent workflows.
- **"Performance is not optional"** — In-process soft restart is faster than process exit + cold start.

## Non-Goals

- **Cross-file dependency tracking** — We don't build our own module graph. We detect the symptom (stale-graph error) and restart.
- **Granular module invalidation** — Bun's bundler owns the module graph. We can't surgically invalidate specific modules.
- **Production impact** — This is dev-only. Zero production code changes.
- **HMR boundary redesign** — We keep `import.meta.hot.accept()` (self-only). The restart is a recovery mechanism, not a replacement for HMR.
- **"Could not resolve" classification** — Generic module resolution errors (`Could not resolve`, `Module not found`) are NOT classified as stale-graph. They already have their own `resolve` error category. These fire for typos, missing dependencies, and genuinely deleted files — auto-restarting for those is counterproductive.

## Unknowns

1. **Does re-creating `Bun.serve()` reset the HMR module graph?** — The restart mechanism creates a new `Bun.serve()` instance (not calling `start()` again — see Restart Mechanism below). Whether Bun creates a fresh dev bundler per `Bun.serve()` call is undocumented. **Resolution:** Verified before Phase 2 implementation via inline POC test in the first TDD cycle. If not, fallback to `process.exit(70)` — see Fallback section.

## POC Results

To be filled after Phase 1 verifies Unknown #1.

## Type Flow Map

No generics introduced. `isStaleGraphError` is `(string) => boolean`. WebSocket messages are plain JSON — no TypeScript types cross the wire.

## E2E Acceptance Test

```ts
describe('Feature: Dev server recovers from stale module graph', () => {
  describe('Given a running dev server with file A importing export X from file B', () => {
    describe('When export X is removed from file B', () => {
      it('Then the error overlay shows with a primary "Restart Server" button', () => {
        // Error: "Export named 'X' not found in module 'B'"
        // Overlay visible with "Restart Server" as primary action
      });

      it('Then clicking "Restart Server" triggers server restart and page reload', () => {
        // After click: overlay shows "Restarting dev server..."
        // After restart: page loads successfully without error
        // Terminal shows: [Server] Restarting: stale module graph detected
        // Terminal shows: [Server] Dev server restarted on port <port>
      });
    });

    describe('When export X is renamed to Y in file B and import updated in A (Phase 3)', () => {
      it('Then auto-restart recovers without user interaction', () => {
        // Auto-restart detects stale-graph error
        // Page reloads with fresh state
        // No manual intervention needed
      });
    });
  });
});
```

---

## Restart Mechanism (Soft Restart)

The restart is NOT `stop() + start()`. The `start()` function performs one-time setup (plugin registration, console.error patching) that must not run twice. Instead, the restart handler performs a targeted **soft restart**:

```
1. Set isRestarting = true (concurrent restart guard)
2. Broadcast { type: 'restarting' } to all WS clients
3. Close file watcher (srcWatcherRef.close())
4. Stop Bun.serve() (server.stop(true))
5. Clear wsClients Set (dead references after stop)
6. Clear state: currentError, pendingRuntimeError, debounce timers,
   lastBuildError, lastBroadcastedError, clearGraceUntil
7. Clear require.cache (clearSSRRequireCache())
8. Invalidate source map cache
9. Re-create Bun.serve() with same config (fresh HMR module graph)
   - Port binding retry: 3 attempts with 100ms/200ms/500ms backoff
   - On failure: log error, set isRestarting = false, do NOT process.exit
10. Re-import SSR module
11. Re-discover HMR assets
12. Re-create file watcher
13. Set isRestarting = false
14. Log: [Server] Dev server restarted on port <port>
```

**What is NOT repeated:**
- `plugin()` registration — guarded by a `pluginsRegistered` flag
- `console.error` patching — stays in place (closure reference preserved)
- `killStaleProcess()` — not needed, we own the port

### Fallback: process.exit(70)

If POC reveals that `Bun.serve()` does NOT reset the HMR module graph:
- The restart handler calls `process.exit(70)` instead of steps 9-14
- The parent process (`@vertz/cli`) watches for exit code 70 and restarts
- Client WS disconnects → reconnection loop → reconnects after CLI restarts
- This fallback changes Phase 2 significantly — CLI needs a process supervisor

### Interaction with existing RELOAD_GUARD_SCRIPT

The client-side `{ type: 'restarting' }` handler clears the existing reload guard counter (`sessionStorage.__vertz_reload_count` and `__vertz_reload_ts`) before the page reloads. This prevents the reload guard from counting the post-restart reload as part of a loop.

---

## Terminal Logging

| Event | Log message |
|-------|-------------|
| Stale-graph error detected | `[Server] Stale graph detected: <truncated error message>` |
| Restart initiated | `[Server] Restarting dev server...` |
| Restart succeeded | `[Server] Dev server restarted on port <port>` |
| Restart failed (port) | `[Server] Restart failed: port <port> in use after 3 retries` |
| Restart failed (other) | `[Server] Restart failed: <error>` |
| Restart skipped (already restarting) | `[Server] Restart already in progress, skipping` |

---

## Implementation Plan

### Phase 1: Stale-graph classification + server restart handler

**Goal:** Detect stale-graph errors and handle explicit restart requests via WebSocket.

**Changes:**
1. Add `isStaleGraphError(message: string): boolean` to `bun-dev-server.ts`
   - Pattern match (export-specific only, NOT "Could not resolve"):
     - `"Export named '...' not found in module '...'"`
     - `"No matching export in '...' for import '...'"`
     - `"does not provide an export named '...'"`
2. Add `restart` case to WS `message` handler
   - Guard with `isRestarting` flag (reject concurrent restarts)
   - Log: `[Server] Restarting dev server...`
   - Broadcast `{ type: 'restarting' }` to all connected clients
   - Execute soft restart (see Restart Mechanism above)
   - Guard plugin registration with `pluginsRegistered` flag
3. Add port binding retry loop (3 attempts, 100/200/500ms backoff)
4. Verify POC: does new `Bun.serve()` give fresh HMR graph?

**Acceptance Criteria:**
```ts
describe('isStaleGraphError', () => {
  it('returns true for "Export named X not found in module Y"', () => {
    expect(isStaleGraphError("Export named 'button' not found in module './styles/components.ts'")).toBe(true);
  });

  it('returns true for "No matching export" errors', () => {
    expect(isStaleGraphError("No matching export in './utils.ts' for import 'helper'")).toBe(true);
  });

  it('returns true for "does not provide an export named" errors', () => {
    expect(isStaleGraphError("./styles/components.ts does not provide an export named 'button'")).toBe(true);
  });

  it('returns false for generic runtime errors', () => {
    expect(isStaleGraphError("Cannot read property 'foo' of undefined")).toBe(false);
  });

  it('returns false for syntax errors', () => {
    expect(isStaleGraphError("Unexpected token '}'")).toBe(false);
  });

  it('returns false for "Could not resolve" errors (handled by resolve category)', () => {
    expect(isStaleGraphError("Could not resolve './missing-module'")).toBe(false);
  });
});

describe('WebSocket restart handler', () => {
  it('handles restart message type without throwing', () => {});
  it('broadcasts restarting to all connected clients before restart', () => {});
  it('rejects concurrent restart requests (isRestarting guard)', () => {});
  it('clears currentError and debounce state during restart', () => {});
  it('retries port binding up to 3 times with backoff', () => {});
  it('logs restart events to terminal', () => {});
});
```

### Phase 2: Client-side overlay + reconnect reload

**Goal:** Error overlay shows primary "Restart Server" button for stale-graph errors. Client auto-reloads after server restart.

**Depends on:** Phase 1.

**Changes to `buildErrorChannelScript`:**
1. Add `isStaleGraph(msg)` inline JS function (mirrors `isStaleGraphError` patterns)
2. In `showOverlay`: accept `restartable` flag
   - When `restartable`: "Restart Server" is primary button (dark bg), "Retry" is secondary (ghost/text)
   - "Restart Server" sends `{ type: 'restart' }` via `V._ws`
3. In error handlers (`window.onerror`, `unhandledrejection`, HMR error intercept):
   - Check `isStaleGraph(msg)` → pass `restartable: true` to `showOverlay`
4. Handle `{ type: 'restarting' }` WS message:
   - Show overlay: "Restarting dev server..." (no buttons, spinner/pulsing dot)
   - Set `V._restarting = true`
   - Clear reload guard counter (`sessionStorage.__vertz_reload_count`, `__vertz_reload_ts`)
5. Fast reconnect after restart:
   - When `V._restarting` and WS closes, reconnect at 100ms intervals (not exponential backoff)
   - After 5s, fall back to normal exponential backoff
6. On WS `connected` with `V._restarting`:
   - Trigger `_reload()` (full page reload)
   - Set `V._restarting = false`
7. Restart timeout:
   - If WS doesn't reconnect within 10s after `{ type: 'restarting' }`:
   - Change overlay to: "Restart timed out. Try restarting manually (Ctrl+C and re-run)."

**Acceptance Criteria:**
```ts
describe('Client-side stale-graph handling', () => {
  it('shows primary "Restart Server" button for stale-graph errors', () => {});
  it('shows secondary "Retry" button alongside for stale-graph errors', () => {});
  it('sends { type: "restart" } when Restart Server button is clicked', () => {});
  it('shows "Restarting dev server..." overlay on restarting message', () => {});
  it('clears reload guard counter on restarting message', () => {});
  it('uses fast reconnect (100ms) after restarting message', () => {});
  it('reloads page on WS connected after restart', () => {});
  it('shows timeout message after 10s without reconnect', () => {});
});
```

### Phase 3: Auto-restart for stale-graph errors (stretch)

**Goal:** Automatic restart without user interaction for high-confidence stale-graph errors.

**Depends on:** Phase 2.

**Changes — server-side auto-restart:**
- In `broadcastError`: when category is `runtime` and `isStaleGraphError` matches, bypass the 100ms debounce and immediately trigger the restart handler
- This handles errors flowing through the server-side console.error intercept path

**Changes — client-side auto-restart:**
- In `window.onerror` handler: if `isStaleGraph(msg)` returns true, auto-send `{ type: 'restart' }` via WS
- Show "Restarting dev server..." overlay immediately (no button click)
- This handles errors that only fire in the browser (not intercepted server-side)

**Restart loop prevention:**
- Time-windowed cap: track restarts in sessionStorage with timestamps
- Allow max 3 auto-restarts within a 10-second window
- After cap reached: fall back to showing the "Restart Server" button (no auto-restart)
- Counter resets after 10s of no auto-restarts, or after a successful page load (no stale-graph error within 5s of load)

**Acceptance Criteria:**
```ts
describe('Auto-restart for stale-graph errors', () => {
  it('server auto-triggers restart for stale-graph errors in broadcastError', () => {});
  it('server bypasses runtime debounce for stale-graph errors', () => {});
  it('client auto-sends restart for stale-graph window.onerror', () => {});
  it('caps auto-restarts at 3 within 10s window', () => {});
  it('falls back to button after cap reached', () => {});
  it('resets cap counter after successful page load', () => {});
  it('concurrent restart guard prevents double-trigger from both paths', () => {});
});
```

---

## Review Sign-offs

### DX (josh) — Rev 1
**Approve** with should-fix items. Key feedback addressed in Rev 2:
- Removed "Could not resolve" from stale-graph patterns ✓
- Made "Restart Server" primary button, "Retry" secondary ✓
- Added 10s timeout to "Restarting..." overlay ✓
- Added terminal logging table ✓
- Moved all auto-restart to Phase 3 (clean incremental story) ✓
- Documented RELOAD_GUARD_SCRIPT interaction ✓

### Product/Scope — Rev 1
**Changes Requested.** Key feedback addressed in Rev 2:
- Clarified error flow paths (server-side vs client-side) with diagram ✓
- Merged old Phases 1+2 (classification was too small standalone) ✓
- Moved all auto-restart to Phase 3 with clear distinction ✓
- Time-windowed restart cap (3 within 10s) instead of flat counter ✓
- Documented "Could not resolve" overlap with existing resolve category ✓
- Unknown #1 verified as first step in Phase 1 ✓

### Technical — Rev 1
**Changes Requested.** Key feedback addressed in Rev 2:
- Designed soft restart mechanism (not stop+start) to avoid re-entry ✓
- Plugin double-registration guarded with `pluginsRegistered` flag ✓
- console.error stays patched (closure preserved, not re-wrapped) ✓
- Explicit closure state reset list ✓
- Port binding retry loop (3 attempts, 100/200/500ms) ✓
- wsClients Set cleared during restart ✓
- `isRestarting` concurrent restart guard ✓
- Documented fallback architecture (process.exit(70)) if POC fails ✓
- Fast reconnect (100ms) instead of exponential backoff after restart ✓
