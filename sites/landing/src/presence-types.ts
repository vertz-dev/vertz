// ── Wire protocol types for real-time presence ─────────────
// Shared between client (PresenceOverlay) and server (DO + dev server).
// Message type discriminant `t` is single-letter for wire efficiency.

/** Client → Server messages */
export type ClientMessage =
  | { t: 'move'; x: number; y: number; s: number }
  | { t: 'interact'; x: number; y: number }
  | { t: 'click'; x: number; y: number }
  | { t: 'ping' };

/** Server → Client messages */
export type ServerMessage =
  | { t: 'state'; peers: Peer[]; count: number }
  | { t: 'join'; peer: Peer }
  | { t: 'leave'; id: string }
  | { t: 'move'; id: string; x: number; y: number; s: number }
  | { t: 'interact'; id: string; x: number; y: number }
  | { t: 'click'; id: string; x: number; y: number }
  | { t: 'pong' };

/** Ephemeral peer identity — assigned by server, no PII */
export type Peer = {
  id: string;
  color: string;
};

/** Internal cursor state tracked by the overlay */
export type CursorState = {
  id: string;
  color: string;
  x: number;
  y: number;
  s: number; // scroll offset (% of document height)
  lastActive: number; // timestamp of last move/interact
};

/** Color palette for peer cursors */
export const CURSOR_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#14B8A6', // teal
  '#A855F7', // purple
] as const;

/** Max cursors rendered at once */
export const MAX_VISIBLE_CURSORS = 15;

/** Scroll proximity threshold (%) — only show cursors within this range */
export const SCROLL_PROXIMITY_THRESHOLD = 15;

/** Idle fade timeout (ms) */
export const IDLE_FADE_MS = 5_000;

/** Idle disappear timeout (ms) */
export const IDLE_DISAPPEAR_MS = 30_000;
