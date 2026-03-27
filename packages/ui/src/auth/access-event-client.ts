/**
 * Access Event Client — WebSocket client for real-time access invalidation.
 *
 * Connects to the access event WebSocket endpoint, handles reconnection
 * with exponential backoff, and delivers parsed events to the caller.
 */

import { isBrowser } from '../env/is-browser';

// ============================================================================
// Types
// ============================================================================

/**
 * Client-side access events.
 *
 * Includes resourceType/resourceId for client-side resource-level filtering.
 * orgId is stripped (routing is server-side only via WebSocket connection keying).
 */
export type ClientAccessEvent =
  | {
      type: 'access:flag_toggled';
      resourceType: string;
      resourceId: string;
      flag: string;
      enabled: boolean;
    }
  | {
      type: 'access:limit_updated';
      resourceType: string;
      resourceId: string;
      entitlement: string;
      consumed: number;
      remaining: number;
      max: number;
    }
  | { type: 'access:role_changed' }
  | { type: 'access:plan_changed'; resourceType: string; resourceId: string }
  | { type: 'access:plan_assigned'; resourceType: string; resourceId: string; planId: string }
  | { type: 'access:addon_attached'; resourceType: string; resourceId: string; addonId: string }
  | { type: 'access:addon_detached'; resourceType: string; resourceId: string; addonId: string }
  | {
      type: 'access:limit_reset';
      resourceType: string;
      resourceId: string;
      entitlement: string;
      max: number;
    };

export interface AccessEventClientOptions {
  /** WebSocket URL. Defaults to deriving from window.location. */
  url?: string;
  /** Called for each access event received from the server. */
  onEvent: (event: ClientAccessEvent) => void;
  /** Called after a successful reconnection (not the initial connect). */
  onReconnect: () => void;
}

export interface AccessEventClient {
  connect(): void;
  disconnect(): void;
  dispose(): void;
}

// ============================================================================
// Constants
// ============================================================================

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const JITTER_FACTOR = 0.25;

// ============================================================================
// createAccessEventClient()
// ============================================================================

export function createAccessEventClient(options: AccessEventClientOptions): AccessEventClient {
  const { onEvent, onReconnect } = options;

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let backoffMs = BASE_BACKOFF_MS;
  let hasConnectedBefore = false;
  let intentionalDisconnect = false;
  let disposed = false;

  function getUrl(): string {
    if (options.url) return options.url;
    if (isBrowser()) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/api/auth/access-events`;
    }
    return 'ws://localhost/api/auth/access-events';
  }

  function applyJitter(delay: number): number {
    const jitter = delay * JITTER_FACTOR;
    return delay - jitter + Math.random() * jitter * 2;
  }

  function scheduleReconnect(): void {
    if (intentionalDisconnect || disposed) return;

    const delay = applyJitter(backoffMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      doConnect();
    }, delay);

    // Increase backoff for next attempt (cap at MAX_BACKOFF_MS)
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  }

  function doConnect(): void {
    if (disposed) return;

    ws = new WebSocket(getUrl());

    ws.onopen = () => {
      // Reset backoff on successful connection
      backoffMs = BASE_BACKOFF_MS;

      if (hasConnectedBefore) {
        onReconnect();
      }
      hasConnectedBefore = true;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as ClientAccessEvent;
        onEvent(data);
      } catch {
        // Invalid JSON — ignore
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!intentionalDisconnect && !disposed) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // Error usually followed by close — let onclose handle reconnection
    };
  }

  function connect(): void {
    intentionalDisconnect = false;
    doConnect();
  }

  function disconnect(): void {
    intentionalDisconnect = true;
    clearReconnectTimer();
    if (ws) {
      ws.onclose = null; // Prevent reconnection from close handler
      ws.close();
      ws = null;
    }
  }

  function dispose(): void {
    disposed = true;
    disconnect();
  }

  return { connect, disconnect, dispose };
}
