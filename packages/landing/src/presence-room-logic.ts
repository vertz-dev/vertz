// ── Pure room logic for real-time presence ──────────────────
// Shared between Cloudflare Durable Object and Bun dev server.
// Takes a broadcast callback — no direct WebSocket dependency.

import type { ClientMessage, ServerMessage } from './presence-types';
import {
  MAX_CONNECTIONS_PER_ROOM,
  MAX_MESSAGE_SIZE,
  MAX_MESSAGES_PER_SECOND,
  VALID_CLIENT_TYPES,
} from './presence-types';

export type ConnectionId = string;

export interface RoomState {
  /** Active connections */
  connections: Set<ConnectionId>;
  /** Rate limit tracking: connectionId → timestamps of recent messages */
  rateLimits: Map<ConnectionId, number[]>;
}

export function createRoom(): RoomState {
  return {
    connections: new Set(),
    rateLimits: new Map(),
  };
}

export type BroadcastFn = (msg: string, exclude?: ConnectionId) => void;
export type SendFn = (connId: ConnectionId, msg: string) => void;
export type CloseFn = (connId: ConnectionId, code: number, reason: string) => void;

/**
 * Handle a new connection joining the room.
 * Returns false if the room is full.
 */
export function handleJoin(
  room: RoomState,
  connId: ConnectionId,
  send: SendFn,
  broadcast: BroadcastFn,
): boolean {
  if (room.connections.size >= MAX_CONNECTIONS_PER_ROOM) {
    return false;
  }

  room.connections.add(connId);
  room.rateLimits.set(connId, []);

  // Send current state to the new connection
  const stateMsg: ServerMessage = { t: 'state', count: room.connections.size };
  send(connId, JSON.stringify(stateMsg));

  // Notify all others about the join
  if (room.connections.size > 1) {
    const joinMsg: ServerMessage = { t: 'join', count: room.connections.size };
    broadcast(JSON.stringify(joinMsg), connId);
  }

  return true;
}

/**
 * Handle a connection leaving the room.
 */
export function handleLeave(
  room: RoomState,
  connId: ConnectionId,
  broadcast: BroadcastFn,
): void {
  room.connections.delete(connId);
  room.rateLimits.delete(connId);

  if (room.connections.size > 0) {
    const leaveMsg: ServerMessage = { t: 'leave', count: room.connections.size };
    broadcast(JSON.stringify(leaveMsg));
  }
}

/**
 * Parse and validate a client message.
 * Returns null if the message is malformed.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_SIZE) return null;

  try {
    const msg = JSON.parse(raw);
    if (typeof msg !== 'object' || msg === null) return null;
    if (!VALID_CLIENT_TYPES.has(msg.t)) return null;
    return msg as ClientMessage;
  } catch {
    return null;
  }
}

/**
 * Check rate limit for a connection.
 * Returns true if the message is allowed, false if rate-limited.
 */
export function checkRateLimit(room: RoomState, connId: ConnectionId): boolean {
  const timestamps = room.rateLimits.get(connId);
  if (!timestamps) return false;

  const now = Date.now();
  const cutoff = now - 1000;

  // Remove timestamps older than 1 second
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= MAX_MESSAGES_PER_SECOND) {
    return false;
  }

  timestamps.push(now);
  return true;
}

/**
 * Handle an incoming message from a connection.
 */
export function handleMessage(
  room: RoomState,
  connId: ConnectionId,
  raw: string,
  send: SendFn,
  broadcast: BroadcastFn,
): void {
  const msg = parseClientMessage(raw);
  if (!msg) return;

  if (!checkRateLimit(room, connId)) return;

  switch (msg.t) {
    case 'ping': {
      const pong: ServerMessage = { t: 'pong' };
      send(connId, JSON.stringify(pong));
      break;
    }
    case 'interact': {
      const interactMsg: ServerMessage = { t: 'interact' };
      broadcast(JSON.stringify(interactMsg), connId);
      break;
    }
  }
}
