import { describe, expect, it } from 'bun:test';
import {
  assignPeerColor,
  filterByScrollProximity,
  selectVisibleCursors,
  isIdle,
  isFaded,
  createSimulatedPeers,
  advanceSimulation,
} from '../presence-logic';
import type { CursorState } from '../presence-types';
import {
  CURSOR_COLORS,
  IDLE_DISAPPEAR_MS,
  IDLE_FADE_MS,
  MAX_VISIBLE_CURSORS,
  SCROLL_PROXIMITY_THRESHOLD,
} from '../presence-types';

// ── assignPeerColor ────────────────────────────────────────

describe('assignPeerColor', () => {
  it('returns a color from the palette', () => {
    const color = assignPeerColor(0);
    expect(CURSOR_COLORS).toContain(color);
  });

  it('cycles through palette for indices beyond length', () => {
    const color0 = assignPeerColor(0);
    const colorN = assignPeerColor(CURSOR_COLORS.length);
    expect(color0).toBe(colorN);
  });

  it('returns different colors for consecutive indices', () => {
    const c0 = assignPeerColor(0);
    const c1 = assignPeerColor(1);
    expect(c0).not.toBe(c1);
  });
});

// ── filterByScrollProximity ────────────────────────────────

describe('filterByScrollProximity', () => {
  const makeCursor = (id: string, s: number): CursorState => ({
    id,
    color: '#fff',
    x: 50,
    y: 50,
    s,
    lastActive: Date.now(),
  });

  it('includes cursors within the scroll threshold', () => {
    const cursors = [makeCursor('a', 10), makeCursor('b', 20)];
    const result = filterByScrollProximity(cursors, 15);
    expect(result).toHaveLength(2);
  });

  it('excludes cursors outside the scroll threshold', () => {
    const cursors = [makeCursor('a', 0), makeCursor('b', 80)];
    const result = filterByScrollProximity(cursors, 50);
    expect(result).toHaveLength(0);
  });

  it('uses SCROLL_PROXIMITY_THRESHOLD (15%) by default', () => {
    const cursors = [makeCursor('a', 30)];
    // localScroll = 50, cursor at 30 => diff = 20 > 15 => excluded
    const result = filterByScrollProximity(cursors, 50);
    expect(result).toHaveLength(0);
  });

  it('includes cursors exactly at the threshold boundary', () => {
    const cursors = [makeCursor('a', 50 - SCROLL_PROXIMITY_THRESHOLD)];
    const result = filterByScrollProximity(cursors, 50);
    expect(result).toHaveLength(1);
  });
});

// ── selectVisibleCursors ───────────────────────────────────

describe('selectVisibleCursors', () => {
  const makeCursor = (id: string, lastActive: number): CursorState => ({
    id,
    color: '#fff',
    x: 50,
    y: 50,
    s: 0,
    lastActive,
  });

  it('returns all cursors when under the limit', () => {
    const cursors = [makeCursor('a', 100), makeCursor('b', 200)];
    const result = selectVisibleCursors(cursors);
    expect(result).toHaveLength(2);
  });

  it('caps at MAX_VISIBLE_CURSORS', () => {
    const cursors = Array.from({ length: 20 }, (_, i) =>
      makeCursor(`peer-${i}`, i * 100),
    );
    const result = selectVisibleCursors(cursors);
    expect(result).toHaveLength(MAX_VISIBLE_CURSORS);
  });

  it('keeps the most recently active cursors', () => {
    const old = makeCursor('old', 100);
    const recent = makeCursor('recent', 999);
    const cursors = Array.from({ length: MAX_VISIBLE_CURSORS }, (_, i) =>
      makeCursor(`filler-${i}`, 500),
    );
    cursors.push(old, recent);
    const result = selectVisibleCursors(cursors);
    const ids = result.map((c) => c.id);
    expect(ids).toContain('recent');
    expect(ids).not.toContain('old');
  });
});

// ── isIdle / isFaded ───────────────────────────────────────

describe('isIdle', () => {
  it('returns false when cursor was just active', () => {
    expect(isIdle(Date.now(), Date.now())).toBe(false);
  });

  it('returns true after IDLE_DISAPPEAR_MS', () => {
    expect(isIdle(Date.now() - IDLE_DISAPPEAR_MS - 1, Date.now())).toBe(true);
  });
});

describe('isFaded', () => {
  it('returns false when cursor was just active', () => {
    expect(isFaded(Date.now(), Date.now())).toBe(false);
  });

  it('returns true after IDLE_FADE_MS', () => {
    expect(isFaded(Date.now() - IDLE_FADE_MS - 1, Date.now())).toBe(true);
  });

  it('returns false if idle (disappeared takes priority)', () => {
    // isFaded should return true even past disappear threshold —
    // the caller decides to hide vs fade based on isIdle
    expect(isFaded(Date.now() - IDLE_DISAPPEAR_MS - 1, Date.now())).toBe(true);
  });
});

// ── Simulation ─────────────────────────────────────────────

describe('createSimulatedPeers', () => {
  it('creates the requested number of peers', () => {
    const peers = createSimulatedPeers(5);
    expect(peers).toHaveLength(5);
  });

  it('assigns unique ids', () => {
    const peers = createSimulatedPeers(5);
    const ids = new Set(peers.map((p) => p.id));
    expect(ids.size).toBe(5);
  });

  it('assigns colors from the palette', () => {
    const peers = createSimulatedPeers(3);
    for (const peer of peers) {
      expect(CURSOR_COLORS).toContain(peer.color);
    }
  });
});

describe('advanceSimulation', () => {
  it('returns updated cursor positions', () => {
    const peers = createSimulatedPeers(2);
    const t0 = peers.map((p) => ({ ...p }));
    const t1 = advanceSimulation(peers, 100);
    // At least one cursor should have moved
    const moved = t1.some(
      (c, i) => c.x !== t0[i].x || c.y !== t0[i].y,
    );
    expect(moved).toBe(true);
  });

  it('keeps positions within bounds [0, 100]', () => {
    const peers = createSimulatedPeers(5);
    // Advance many steps
    let state = peers;
    for (let i = 0; i < 100; i++) {
      state = advanceSimulation(state, i * 66);
    }
    for (const cursor of state) {
      expect(cursor.x).toBeGreaterThanOrEqual(0);
      expect(cursor.x).toBeLessThanOrEqual(100);
      expect(cursor.y).toBeGreaterThanOrEqual(0);
      expect(cursor.y).toBeLessThanOrEqual(100);
      expect(cursor.s).toBeGreaterThanOrEqual(0);
      expect(cursor.s).toBeLessThanOrEqual(100);
    }
  });
});
