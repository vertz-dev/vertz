/**
 * HMR-style teardown contract tests for the stream overload of `query()`.
 *
 * Uses REAL timers (no fake timers) and a mock WebSocket to verify the
 * lifecycle contract end-to-end:
 *  - data accumulates with parsed values from a real-shaped event source
 *  - dispose() closes the underlying socket within a real-time budget
 *  - Disposed signals stay aborted; new queries get a fresh signal that is
 *    a distinct instance from the previous one (HMR re-mount contract).
 *
 * Mock-based, so safe to run in default `vtz test` (no real I/O / port
 * binding / file watchers — see `.claude/rules/integration-test-safety.md`).
 */

import { afterEach, beforeEach, describe, expect, test } from '@vertz/test';
import { fromWebSocket } from '../sources';
import { QueryDisposedReason, query, resetDefaultQueryCache } from '../query';

// ─── Minimal real-WebSocket-shaped mock with a real timing model ─────

class RealisticFakeWS {
  closed = false;
  private listeners = new Map<string, Array<(e: { data?: unknown }) => void>>();
  static instances: RealisticFakeWS[] = [];
  constructor(public readonly url: string) {
    RealisticFakeWS.instances.push(this);
  }
  addEventListener(type: string, fn: (e: { data?: unknown }) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  emit(type: string, data?: unknown): void {
    const fns = this.listeners.get(type) ?? [];
    for (const fn of fns) fn({ data });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

const g = globalThis as Record<string, unknown>;
let originalWS: unknown;

beforeEach(() => {
  RealisticFakeWS.instances = [];
  originalWS = g.WebSocket;
  g.WebSocket = RealisticFakeWS;
  resetDefaultQueryCache();
});
afterEach(() => {
  // Close any lingering sockets so the test runner exits cleanly.
  for (const ws of RealisticFakeWS.instances) ws.close();
  g.WebSocket = originalWS;
});

describe('query() + fromWebSocket — end-to-end lifecycle', () => {
  describe('Given a query backed by fromWebSocket', () => {
    describe('When messages stream in', () => {
      test('then data accumulates with parsed values', async () => {
        const q = query<{ tick: number }>(
          (signal) => fromWebSocket<{ tick: number }>('wss://test/x', signal as AbortSignal),
          { key: 'realtime-test' },
        );
        // Wait for the WebSocket constructor to fire and the helper to install
        // its message listener.
        await new Promise((r) => setTimeout(r, 10));
        const ws = RealisticFakeWS.instances[0]!;
        ws.emit('message', JSON.stringify({ tick: 1 }));
        ws.emit('message', JSON.stringify({ tick: 2 }));
        ws.emit('message', JSON.stringify({ tick: 3 }));
        await new Promise((r) => setTimeout(r, 10));
        expect(q.data.value).toEqual([{ tick: 1 }, { tick: 2 }, { tick: 3 }]);
        expect(q.loading.value).toBe(false);
        q.dispose();
      });
    });
  });

  describe('Given a running query with an open WebSocket', () => {
    describe('When dispose() fires', () => {
      test('then the WebSocket closes within 50ms (proven by ws.closed === true)', async () => {
        const q = query((signal) => fromWebSocket('wss://test/x', signal as AbortSignal), {
          key: 'close-on-dispose',
        });
        await new Promise((r) => setTimeout(r, 10));
        const ws = RealisticFakeWS.instances[0]!;
        expect(ws.closed).toBe(false);

        q.dispose();
        // The close happens synchronously in the abort listener path,
        // but allow a microtask cycle to be safe.
        await new Promise((r) => setTimeout(r, 50));
        expect(ws.closed).toBe(true);
      });
    });
  });

  describe('Given a query is disposed (HMR-style teardown contract)', () => {
    describe('When a fresh query for the same key is created', () => {
      test('then the previous AbortSignal stays aborted and the new query gets a fresh one', async () => {
        let captured1: AbortSignal | undefined;
        let captured2: AbortSignal | undefined;
        async function* probe(signal?: AbortSignal) {
          captured1 = signal;
          // Yield once to let `query()` settle into stream mode.
          yield 'tick';
          // Block until aborted.
          await new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => resolve());
          });
        }
        const q1 = query((sig) => probe(sig), { key: 'hmr-style' });
        await new Promise((r) => setTimeout(r, 20));
        expect(captured1).toBeInstanceOf(AbortSignal);
        expect(captured1?.aborted).toBe(false);

        // Simulate HMR: dispose the previous module's query before the new
        // module's query is created.  This is the contract the Vertz HMR
        // runtime gives us — components dispose before their replacement
        // mounts.
        q1.dispose();

        // After dispose, the previous signal stays aborted (it's on a
        // controller that the framework has now released).
        expect(captured1?.aborted).toBe(true);
        expect(captured1?.reason).toBeInstanceOf(QueryDisposedReason);

        // New query, same key — gets a brand-new AbortSignal.
        async function* probe2(signal?: AbortSignal) {
          captured2 = signal;
          yield 'tick';
        }
        const q2 = query((sig) => probe2(sig), { key: 'hmr-style' });
        await new Promise((r) => setTimeout(r, 20));
        expect(captured2).toBeInstanceOf(AbortSignal);
        // Distinct controller instance — proves no shared state across
        // disposal boundary.
        expect(captured2).not.toBe(captured1);
        // The previous signal is still aborted — independent of the new one.
        expect(captured1?.aborted).toBe(true);
        expect(captured2?.aborted).toBe(false);

        q2.dispose();
      });
    });
  });
});
