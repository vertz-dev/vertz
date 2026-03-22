# fix(ui-server): HMR restart-to-ready race condition

## Problem

When the dev server restarts (triggered by upstream dist changes via `createUpstreamWatcher`), there's a race condition between the server becoming ready and clients reconnecting:

1. Server sends `{ type: 'restarting' }` to clients, then calls `stop()`
2. After a retry delay (100ms minimum), `start()` is called
3. `start()` calls `Bun.serve()` — server immediately accepts connections
4. `start()` then `await`s `discoverHMRAssets()` — a self-fetch to `/__vertz_hmr` (~2-10ms)
5. But the WebSocket `open` handler (line 1634) immediately sends `{ type: 'connected' }` — no gate
6. Client receives `connected` while `_restarting=true`, calls `_reload()` immediately
7. Page loads with `bundledScriptUrl = null` → `buildScriptTag()` returns a plain `<script type="module">` without the `BUILD_ERROR_LOADER` validation
8. If Bun's bundler hash isn't stable yet, client gets the reload stub → infinite reload loop

### Timeline

```
Server                                Client
──────                                ──────
broadcast { restarting }  ──────────→ _restarting = true
stop()                                ws.onclose → reconnect in 100ms
  ... port release ...
  delay 100ms
Bun.serve() ← accepting connections
  discoverHMRAssets() starts
                          ←───────── ws reconnects (100ms timer)
ws.open → send { connected }
  discoverHMRAssets() still running   receives 'connected', _restarting=true
                                      → _reload()
  bundledScriptUrl is STILL null      page loads → no BUILD_ERROR_LOADER
                                      → potential reload stub → infinite loop
  discoverHMRAssets() completes
  bundledScriptUrl set (too late)
```

### Impact

- **User-visible:** After rebuilding a workspace-linked `@vertz/*` package, the dev server restarts but the page enters an infinite reload loop instead of cleanly reloading
- **Existing mitigation:** `RELOAD_GUARD_SCRIPT` catches this after 10 rapid reloads and shows a fallback overlay, but that's 10 wasted reloads and a degraded DX
- **Workaround:** Manual browser refresh after the "Dev server connection lost" overlay appears

## API Surface

No public API change. This is an internal fix to the dev server restart flow.

### Behavioral change

Before: `{ type: 'connected' }` sent immediately on WebSocket open, even during restart
After: `{ type: 'connected' }` deferred until `discoverHMRAssets()` completes (or times out) during both initial start and restart

## Design

### Approach: Ready gate on WebSocket `connected` message

Add a `ready` flag that starts `false` during `start()` and flips to `true` after `discoverHMRAssets()` completes (or fails/times out). The WebSocket `open` handler checks this flag before sending `{ type: 'connected' }`. If not ready, it queues the client and sends `connected` once the gate opens.

**Key invariant:** The gate is one-shot per `start()` invocation. Once `serverReady` flips to `true`, it stays `true` for the lifetime of that server instance. Subsequent `discoverHMRAssets()` calls (triggered by file changes at lines 1818-1859) do NOT re-gate — they only update `bundledScriptUrl`.

**Scoping:** `serverReady` and `pendingClients` are declared inside `start()`, so each `start()` call (including restarts) gets a fresh gate. No stale references carry over from a previous server incarnation.

```typescript
// In start(), before Bun.serve():
let serverReady = false;
const pendingClients: Set<ServerWebSocket> = new Set();

function flushPendingClients() {
  for (const ws of pendingClients) {
    try {
      ws.sendText(JSON.stringify({ type: 'connected' }));
      if (currentError) {
        ws.sendText(JSON.stringify({
          type: 'error',
          category: currentError.category,
          errors: currentError.errors,
        }));
      }
    } catch {
      // Client disconnected before gate opened
    }
  }
  pendingClients.clear();
}

// WebSocket open handler:
open(ws) {
  wsClients.add(ws);
  if (serverReady) {
    ws.sendText(JSON.stringify({ type: 'connected' }));
    // ... send currentError if any
  } else {
    pendingClients.add(ws);
  }
},

// WebSocket close handler (addition):
close(ws) {
  wsClients.delete(ws);
  pendingClients.delete(ws); // Remove from pending queue if gated
},

// After discoverHMRAssets() — with timeout + finally:
const gateTimeout = setTimeout(() => {
  if (!serverReady) {
    console.warn('[Server] HMR asset discovery timed out — unblocking clients');
    serverReady = true;
    flushPendingClients();
  }
}, 5000);

try {
  await discoverHMRAssets();
} finally {
  clearTimeout(gateTimeout);
  if (!serverReady) {
    serverReady = true;
    flushPendingClients();
  }
}
```

### Failure resilience

The gate **always opens**, even when `discoverHMRAssets()` fails:

1. **`discoverHMRAssets()` throws** → `finally` block opens the gate. Clients get `connected` with `bundledScriptUrl = null` — same degraded behavior as today (plain `<script>` tag without `BUILD_ERROR_LOADER`), but no worse.
2. **Self-fetch hangs** → 5s timeout opens the gate. Clients get degraded mode. The `RELOAD_GUARD_SCRIPT` remains as the last-resort safety net.
3. **`discoverHMRAssets()` succeeds but `bundledScriptUrl` is still null** (e.g., HMR HTML didn't contain the expected script URL) → `finally` opens the gate. Again, same degraded behavior as today.

The gate's job is to **delay** the `connected` message, not to guarantee `bundledScriptUrl` is set. If discovery fails, we degrade gracefully to the existing behavior rather than hanging clients.

### Why a gate, not a delay

- **A delay is fragile** — any fixed timeout is either too short (race still possible) or too long (unnecessary slowdown)
- **The gate is precise** — clients get `connected` exactly when the server is ready, no earlier, no later
- **The gate is self-documenting** — `serverReady` clearly communicates intent

### Why not defer `Bun.serve()`

We can't delay `Bun.serve()` until after `discoverHMRAssets()` because `discoverHMRAssets()` self-fetches the server — it needs the server to be running. The gate approach lets the server accept connections (needed for the self-fetch) while holding off client notifications.

### Thread safety

Bun's event loop is single-threaded. The `open()` handler, the `discoverHMRAssets()` continuation, and the flush loop all execute on the same thread. There are no data races on `serverReady` or `pendingClients`. No synchronization primitives needed.

## Manifesto Alignment

- **Principle 1 (Developer Experience):** Eliminates a confusing reload loop that requires manual intervention
- **Principle 4 (Correctness):** Race conditions are correctness bugs; the gate makes the ordering deterministic

## Non-Goals

- Changing the upstream watcher debounce timing
- Changing the client-side reconnection strategy
- Adding new WebSocket message types
- Fixing the `RELOAD_GUARD_SCRIPT` (it remains as a last-resort safety net)

## Unknowns

- None identified. The fix is localized to the `start()` and WebSocket `open`/`close` handlers within `bun-dev-server.ts`. Thread safety is confirmed (single-threaded event loop).

## Type Flow Map

No generic types involved. The change is behavioral (runtime flag + queue), not type-level.

## E2E Acceptance Test

This is an internal dev server fix. The acceptance criteria are unit/integration tests that verify the ordering:

```typescript
describe('Feature: Restart-to-ready gate', () => {
  describe('Given a dev server during start (initial or restart)', () => {
    describe('When a WebSocket client connects before discoverHMRAssets completes', () => {
      it('Then the connected message is deferred until the server is ready', () => {
        // Verify no 'connected' message sent until serverReady = true
      });
    });

    describe('When discoverHMRAssets completes', () => {
      it('Then all pending clients receive the connected message', () => {
        // Verify queued clients get 'connected' + any currentError
      });
    });

    describe('When discoverHMRAssets fails', () => {
      it('Then pending clients still receive connected (via finally block)', () => {
        // Verify gate opens even on discovery failure
      });
    });

    describe('When discoverHMRAssets hangs beyond 5s', () => {
      it('Then pending clients receive connected via timeout fallback', () => {
        // Verify timeout opens the gate
      });
    });
  });

  describe('Given a server that has completed startup', () => {
    describe('When a WebSocket client connects after discoverHMRAssets', () => {
      it('Then the connected message is sent immediately', () => {
        // serverReady is true after start completes, no delay
      });
    });
  });

  describe('Given a pending client that disconnects before the gate opens', () => {
    describe('When the gate opens', () => {
      it('Then the disconnected client is skipped without error', () => {
        // Verify close handler removes from pendingClients + try/catch in flush
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Ready gate with failure resilience

**Scope:** Add the `serverReady` flag, `pendingClients` set, gate the `connected` message, flush after `discoverHMRAssets()` with `try/finally` and 5s timeout, and handle pending client cleanup on close.

**Files changed:**
- `packages/ui-server/src/bun-dev-server.ts`

**Acceptance criteria:**
- `serverReady` starts `false` during `start()`, re-declared on each call (fresh gate per restart)
- WebSocket `open` handler queues clients when `!serverReady`
- WebSocket `close` handler removes client from both `wsClients` and `pendingClients`
- After `discoverHMRAssets()`, `serverReady = true` and pending clients are flushed
- `currentError` is also sent to pending clients on flush (same as immediate path)
- Flush uses try/catch per client to handle already-closed sockets
- If `discoverHMRAssets()` fails, `finally` block still opens the gate
- If `discoverHMRAssets()` hangs > 5s, timeout opens the gate with a warning log
- Subsequent `discoverHMRAssets()` calls (file-change-triggered) do not re-gate
- On `restart()`, the new `start()` call correctly re-initializes the gate

**Tests:**
- Unit test: WebSocket `open` during `!serverReady` → no immediate `connected` message
- Unit test: After `serverReady = true`, pending clients receive `connected`
- Unit test: Normal (post-start) connection sends `connected` immediately
- Unit test: `currentError` sent to pending clients alongside `connected`
- Unit test: Client disconnects while pending → removed from queue, no crash on flush
- Unit test: `discoverHMRAssets()` failure → gate opens via `finally`, clients get `connected`
- Unit test: Gate timeout fires after 5s → clients unblocked with warning
