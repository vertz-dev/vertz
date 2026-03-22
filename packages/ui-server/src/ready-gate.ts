/**
 * Ready gate for WebSocket client notifications during server start/restart.
 *
 * Defers `{ type: 'connected' }` messages until the server is fully ready
 * (i.e., HMR asset discovery is complete). Clients that connect before the
 * gate opens are queued; once `open()` is called, all pending clients are
 * flushed their `connected` message.
 *
 * The gate is one-shot: once opened, it stays open. Subsequent calls to
 * `open()` are no-ops. Each `start()` call should create a new gate.
 */

import type { ServerWebSocket } from 'bun';

export interface CurrentError {
  category: string;
  errors: Array<{ message: string }>;
}

export interface ReadyGate {
  /** Whether the gate is open (server ready). */
  readonly isReady: boolean;
  /**
   * Called when a WebSocket client connects.
   * If the gate is closed, the client is queued and returns `true`.
   * If the gate is open, returns `false` (caller should send `connected` immediately).
   */
  onOpen(ws: ServerWebSocket<unknown>): boolean;
  /** Called when a WebSocket client disconnects — removes from pending queue. */
  onClose(ws: ServerWebSocket<unknown>): void;
  /**
   * Open the gate: flush all pending clients with `connected` (and optional error).
   * Idempotent — calling multiple times is safe.
   */
  open(currentError?: CurrentError | null): void;
}

export interface ReadyGateOptions {
  /** Auto-open the gate after this many ms if open() hasn't been called. */
  timeoutMs?: number;
  /** Called when the timeout fires — use for logging warnings. */
  onTimeoutWarning?: () => void;
}

export function createReadyGate(options?: ReadyGateOptions): ReadyGate {
  let ready = false;
  const pendingClients = new Set<ServerWebSocket<unknown>>();

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  function doOpen(currentError?: CurrentError | null) {
    if (ready) return;
    ready = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }

    for (const ws of pendingClients) {
      try {
        ws.sendText(JSON.stringify({ type: 'connected' }));
        if (currentError) {
          ws.sendText(
            JSON.stringify({
              type: 'error',
              category: currentError.category,
              errors: currentError.errors,
            }),
          );
        }
      } catch {
        // Client disconnected before gate opened — skip
      }
    }
    pendingClients.clear();
  }

  // Start the timeout if configured
  if (options?.timeoutMs) {
    timeoutHandle = setTimeout(() => {
      if (!ready) {
        options.onTimeoutWarning?.();
        doOpen();
      }
    }, options.timeoutMs);
  }

  return {
    get isReady() {
      return ready;
    },

    onOpen(ws) {
      if (ready) return false;
      pendingClients.add(ws);
      return true;
    },

    onClose(ws) {
      pendingClients.delete(ws);
    },

    open: doOpen,
  };
}
