/**
 * Access Event Broadcaster — WebSocket server for real-time access invalidation.
 *
 * Manages authenticated WebSocket connections and broadcasts access events
 * (flag toggles, limit updates, role changes, plan changes) to affected clients.
 */

import type { KeyObject } from 'node:crypto';
import { verifyJWT } from './jwt';

// ============================================================================
// Types
// ============================================================================

export type AccessEvent =
  | { type: 'access:flag_toggled'; orgId: string; flag: string; enabled: boolean }
  | {
      type: 'access:limit_updated';
      orgId: string;
      entitlement: string;
      consumed: number;
      remaining: number;
      max: number;
    }
  | { type: 'access:role_changed'; userId: string }
  | { type: 'access:plan_changed'; orgId: string }
  | { type: 'access:plan_assigned'; orgId: string; planId: string }
  | { type: 'access:addon_attached'; orgId: string; addonId: string }
  | { type: 'access:addon_detached'; orgId: string; addonId: string }
  | { type: 'access:limit_reset'; orgId: string; entitlement: string; max: number };

export interface AccessWsData {
  userId: string;
  orgId: string;
}

export interface AccessEventBroadcasterConfig {
  /** RSA public key for JWT verification. */
  publicKey: KeyObject;
  /** WebSocket upgrade path. Defaults to '/api/auth/access-events'. */
  path?: string;
  /** Cookie name for session JWT. Defaults to 'vertz.sid'. */
  cookieName?: string;
  /** JWT `iss` claim to validate during verification. */
  issuer?: string;
  /** JWT `aud` claim to validate during verification. */
  audience?: string;
}

export interface AccessEventBroadcaster {
  handleUpgrade(request: Request, server: BunServer): Promise<boolean>;
  websocket: {
    open(ws: BunWebSocket<AccessWsData>): void;
    message(ws: BunWebSocket<AccessWsData>, msg: string | Buffer): void;
    close(ws: BunWebSocket<AccessWsData>): void;
  };
  broadcastFlagToggle(orgId: string, flag: string, enabled: boolean): void;
  broadcastLimitUpdate(
    orgId: string,
    entitlement: string,
    consumed: number,
    remaining: number,
    max: number,
  ): void;
  broadcastRoleChange(userId: string): void;
  broadcastPlanChange(orgId: string): void;
  broadcastPlanAssigned(orgId: string, planId: string): void;
  broadcastAddonAttached(orgId: string, addonId: string): void;
  broadcastAddonDetached(orgId: string, addonId: string): void;
  broadcastLimitReset(orgId: string, entitlement: string, max: number): void;
  getConnectionCount: number;
}

/** Minimal Bun.Server interface for WebSocket upgrade */
interface BunServer {
  upgrade(request: Request, options?: { data?: AccessWsData }): boolean;
}

/** Minimal Bun.ServerWebSocket interface */
interface BunWebSocket<T> {
  data: T;
  send(data: string): void;
  close(): void;
  ping(): void;
}

// ============================================================================
// createAccessEventBroadcaster()
// ============================================================================

export function createAccessEventBroadcaster(
  config: AccessEventBroadcasterConfig,
): AccessEventBroadcaster {
  const {
    publicKey,
    path = '/api/auth/access-events',
    cookieName = 'vertz.sid',
    issuer,
    audience,
  } = config;

  // Connection tracking: orgId -> Set<ws>, userId -> Set<ws>
  const connectionsByOrg = new Map<string, Set<BunWebSocket<AccessWsData>>>();
  const connectionsByUser = new Map<string, Set<BunWebSocket<AccessWsData>>>();
  let connectionCount = 0;

  // Ping keepalive — ping all connections every 30s
  const allConnections = new Set<BunWebSocket<AccessWsData>>();
  const PING_INTERVAL_MS = 30_000;
  const pingTimer = setInterval(() => {
    for (const ws of allConnections) {
      try {
        ws.ping();
      } catch {
        // Connection may have been dropped — onclose will clean up
      }
    }
  }, PING_INTERVAL_MS);
  // Prevent the timer from keeping the process alive
  if (typeof pingTimer === 'object' && 'unref' in pingTimer) {
    pingTimer.unref();
  }

  function addConnection(ws: BunWebSocket<AccessWsData>): void {
    const { orgId, userId } = ws.data;

    let orgSet = connectionsByOrg.get(orgId);
    if (!orgSet) {
      orgSet = new Set();
      connectionsByOrg.set(orgId, orgSet);
    }
    orgSet.add(ws);

    let userSet = connectionsByUser.get(userId);
    if (!userSet) {
      userSet = new Set();
      connectionsByUser.set(userId, userSet);
    }
    userSet.add(ws);

    allConnections.add(ws);
    connectionCount++;
  }

  function removeConnection(ws: BunWebSocket<AccessWsData>): void {
    const { orgId, userId } = ws.data;

    const orgSet = connectionsByOrg.get(orgId);
    if (orgSet) {
      orgSet.delete(ws);
      if (orgSet.size === 0) connectionsByOrg.delete(orgId);
    }

    const userSet = connectionsByUser.get(userId);
    if (userSet) {
      userSet.delete(ws);
      if (userSet.size === 0) connectionsByUser.delete(userId);
    }

    allConnections.delete(ws);
    connectionCount--;
  }

  function broadcastToOrg(orgId: string, message: string): void {
    const orgSet = connectionsByOrg.get(orgId);
    if (!orgSet) return;
    for (const ws of orgSet) {
      ws.send(message);
    }
  }

  function broadcastToUser(userId: string, message: string): void {
    const userSet = connectionsByUser.get(userId);
    if (!userSet) return;
    for (const ws of userSet) {
      ws.send(message);
    }
  }

  // Parse cookie from request headers
  function parseCookie(request: Request): string | null {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.split('=');
      if (name === cookieName) {
        return rest.join('=');
      }
    }
    return null;
  }

  async function handleUpgrade(request: Request, server: BunServer): Promise<boolean> {
    const url = new URL(request.url);
    if (url.pathname !== path) return false;

    const token = parseCookie(request);
    if (!token) return false;

    try {
      const payload = await verifyJWT(token, publicKey, { issuer, audience });
      if (!payload || !payload.sub) return false;

      // Extract orgId from JWT claims — look for org, orgId, or default to ''
      const claims = payload.claims as Record<string, string> | undefined;
      const orgId = claims?.orgId ?? '';

      return server.upgrade(request, {
        data: {
          userId: payload.sub,
          orgId,
        },
      });
    } catch {
      return false;
    }
  }

  const websocket = {
    open(ws: BunWebSocket<AccessWsData>): void {
      addConnection(ws);
    },
    message(_ws: BunWebSocket<AccessWsData>, msg: string | Buffer): void {
      // Client->server: only handle pong responses
      const msgStr = typeof msg === 'string' ? msg : msg.toString();
      if (msgStr === 'pong') {
        // Pong received — connection is alive
        return;
      }
    },
    close(ws: BunWebSocket<AccessWsData>): void {
      removeConnection(ws);
    },
  };

  function broadcastFlagToggle(orgId: string, flag: string, enabled: boolean): void {
    const event: AccessEvent = { type: 'access:flag_toggled', orgId, flag, enabled };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  function broadcastLimitUpdate(
    orgId: string,
    entitlement: string,
    consumed: number,
    remaining: number,
    max: number,
  ): void {
    const event: AccessEvent = {
      type: 'access:limit_updated',
      orgId,
      entitlement,
      consumed,
      remaining,
      max,
    };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  function broadcastRoleChange(userId: string): void {
    const event: AccessEvent = { type: 'access:role_changed', userId };
    broadcastToUser(userId, JSON.stringify(event));
  }

  function broadcastPlanChange(orgId: string): void {
    const event: AccessEvent = { type: 'access:plan_changed', orgId };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  function broadcastPlanAssigned(orgId: string, planId: string): void {
    const event: AccessEvent = { type: 'access:plan_assigned', orgId, planId };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  function broadcastAddonAttached(orgId: string, addonId: string): void {
    const event: AccessEvent = { type: 'access:addon_attached', orgId, addonId };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  function broadcastAddonDetached(orgId: string, addonId: string): void {
    const event: AccessEvent = { type: 'access:addon_detached', orgId, addonId };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  function broadcastLimitReset(orgId: string, entitlement: string, max: number): void {
    const event: AccessEvent = { type: 'access:limit_reset', orgId, entitlement, max };
    broadcastToOrg(orgId, JSON.stringify(event));
  }

  return {
    handleUpgrade,
    websocket,
    broadcastFlagToggle,
    broadcastLimitUpdate,
    broadcastRoleChange,
    broadcastPlanChange,
    broadcastPlanAssigned,
    broadcastAddonAttached,
    broadcastAddonDetached,
    broadcastLimitReset,
    get getConnectionCount() {
      return connectionCount;
    },
  };
}
