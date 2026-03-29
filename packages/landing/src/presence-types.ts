// ── Wire protocol types for real-time presence ─────────────
// Shared between client (hero.tsx) and server (DO + dev server).
//
// PRIVACY RULE: No user-generated content is EVER transmitted.
// Only interaction signals and connection lifecycle events.

/** Client → Server messages */
export type ClientMessage = { t: 'interact' } | { t: 'ping' };

/** Server → Client messages */
export type ServerMessage =
  | { t: 'state'; count: number }
  | { t: 'join'; count: number }
  | { t: 'leave'; count: number }
  | { t: 'interact' }
  | { t: 'pong' };

/** Known client message types for validation */
export const VALID_CLIENT_TYPES = new Set(['interact', 'ping']);

/** Max message size in bytes */
export const MAX_MESSAGE_SIZE = 64;

/** Max messages per second per connection */
export const MAX_MESSAGES_PER_SECOND = 5;

/** Max connections per room */
export const MAX_CONNECTIONS_PER_ROOM = 50;

/** Max connections per IP */
export const MAX_CONNECTIONS_PER_IP = 3;

/** Keepalive interval (ms) — client sends ping */
export const KEEPALIVE_INTERVAL_MS = 30_000;

/** Idle timeout (ms) — server disconnects if no messages */
export const IDLE_TIMEOUT_MS = 120_000;
