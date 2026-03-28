import type { CursorState } from './presence-types';
import {
  CURSOR_COLORS,
  IDLE_DISAPPEAR_MS,
  IDLE_FADE_MS,
  MAX_VISIBLE_CURSORS,
  SCROLL_PROXIMITY_THRESHOLD,
} from './presence-types';

// ── Peer assignment ────────────────────────────────────────

/** Assign a cursor color by index, cycling through the palette. */
export function assignPeerColor(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

// ── Scroll proximity filtering ─────────────────────────────

/**
 * Filter cursors to only those within the scroll proximity threshold
 * of the local user's scroll position.
 */
export function filterByScrollProximity(
  cursors: CursorState[],
  localScroll: number,
  threshold = SCROLL_PROXIMITY_THRESHOLD,
): CursorState[] {
  return cursors.filter((c) => Math.abs(c.s - localScroll) <= threshold);
}

// ── Visibility cap ─────────────────────────────────────────

/**
 * Select up to MAX_VISIBLE_CURSORS, keeping the most recently active.
 * Uses least-recently-active eviction.
 */
export function selectVisibleCursors(
  cursors: CursorState[],
  max = MAX_VISIBLE_CURSORS,
): CursorState[] {
  if (cursors.length <= max) return cursors;
  const sorted = [...cursors].sort((a, b) => b.lastActive - a.lastActive);
  return sorted.slice(0, max);
}

// ── Idle state ─────────────────────────────────────────────

/** Returns true if the cursor should be completely hidden (gone). */
export function isIdle(lastActive: number, now: number): boolean {
  return now - lastActive > IDLE_DISAPPEAR_MS;
}

/** Returns true if the cursor should be faded (30% opacity). */
export function isFaded(lastActive: number, now: number): boolean {
  return now - lastActive > IDLE_FADE_MS;
}

// ── Simulation (Phase 1 only) ──────────────────────────────

/**
 * Create simulated peers with initial positions and movement parameters.
 * Each peer has a sinusoidal movement pattern with random phase offsets
 * so cursors move in different, organic-looking paths.
 */
export function createSimulatedPeers(count: number): CursorState[] {
  // Clear movement params to prevent memory leaks and ensure test isolation
  peerMovement = new Map();

  return Array.from({ length: count }, (_, i) => ({
    id: `sim-${i}`,
    color: assignPeerColor(i),
    x: 20 + Math.random() * 60, // start in center 60% of viewport
    y: 20 + Math.random() * 60,
    s: Math.random() * 20, // near top of page
    lastActive: Date.now(),
  }));
}

/** Per-peer movement parameters, keyed by peer ID. */
export type PeerMovementParams = {
  phaseX: number;
  phaseY: number;
  phaseS: number;
  speedX: number;
  speedY: number;
  speedS: number;
};

// Cleared on each createSimulatedPeers call to prevent memory leaks and
// ensure test isolation.
let peerMovement = new Map<string, PeerMovementParams>();

function getMovementParams(id: string) {
  let params = peerMovement.get(id);
  if (!params) {
    params = {
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      phaseS: Math.random() * Math.PI * 2,
      speedX: 0.0005 + Math.random() * 0.001,
      speedY: 0.0003 + Math.random() * 0.0008,
      speedS: 0.0001 + Math.random() * 0.0002,
    };
    peerMovement.set(id, params);
  }
  return params;
}

/**
 * Advance all simulated cursors by one tick.
 * Uses sinusoidal movement with per-peer phase offsets for organic motion.
 */
export function advanceSimulation(
  cursors: CursorState[],
  elapsed: number,
): CursorState[] {
  return cursors.map((c) => {
    const p = getMovementParams(c.id);
    // Last peer goes idle after 10s to demo the fade/disappear behavior
    const goesIdle = c.id === `sim-${cursors.length - 1}` && elapsed > 10_000;
    if (goesIdle) return c; // freeze position and lastActive

    const x = 50 + Math.sin(elapsed * p.speedX + p.phaseX) * 30;
    const y = 50 + Math.cos(elapsed * p.speedY + p.phaseY) * 30;
    // Absolute sine — oscillates [0, 20], never drifts to boundary
    const s = 10 + Math.sin(elapsed * p.speedS + p.phaseS) * 10;
    return { ...c, x, y, s, lastActive: Date.now() };
  });
}
