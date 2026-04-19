import { afterEach, beforeEach, describe, expect, test, vi } from '@vertz/test';
import { signal as createSignal } from '../../runtime/signal';
import { QueryDisposedReason, resetDefaultQueryCache } from '../query';
import { query } from '../query';

/**
 * Flush microtasks several times so async-generator pumps drain under fake timers.
 * Each `for await` step queues a microtask; multiple flushes ensure all yields
 * land before assertions.
 */
async function flushPromises(rounds = 16): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
  }
}

describe('query() — stream sources', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDefaultQueryCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Given an AsyncIterable that yields three items', () => {
    describe('When the query is created', () => {
      test('then loading becomes false after the first yield and data accumulates in order', async () => {
        async function* mock() {
          yield { id: '1', text: 'a' };
          yield { id: '2', text: 'b' };
          yield { id: '3', text: 'c' };
        }
        const q = query(() => mock(), { key: 'acc-test' });

        // Initial state: loading, idle, empty
        expect(q.loading.value).toBe(true);
        expect(q.data.value).toEqual([]);
        expect(q.idle.value).toBe(true);

        await flushPromises();

        expect(q.loading.value).toBe(false);
        expect(q.error.value).toBeUndefined();
        expect(q.data.value.map((x) => x.id)).toEqual(['1', '2', '3']);
        expect(q.idle.value).toBe(false);
      });
    });
  });

  describe('Given an iterator that throws after one yield', () => {
    describe('When the query pumps the iterator', () => {
      test('then error is set and data preserves the items yielded before the throw', async () => {
        async function* failing() {
          yield { id: '1' };
          throw new Error('upstream gone');
        }
        const q = query(() => failing(), { key: 'err-test' });

        await flushPromises();

        expect(q.data.value).toEqual([{ id: '1' }]);
        expect(q.error.value).toBeInstanceOf(Error);
        expect((q.error.value as Error).message).toBe('upstream gone');
        expect(q.loading.value).toBe(false);
      });
    });
  });

  describe('Given refetchInterval and a stream thunk together', () => {
    describe('When the query is constructed', () => {
      test('then construction throws a usage error naming both options', () => {
        async function* s() {
          yield 1;
        }
        // The stream-classification + mutual-exclusion check both run inside
        // lifecycleEffect's first tick, which is invoked synchronously when
        // query() installs the effect.  So the throw is observable directly
        // from the construction expression — no microtask flush needed.
        const constructQuery = () => {
          // The stream-overload type omits refetchInterval; cast to bypass for the runtime test.
          query(() => s() as AsyncIterable<number>, {
            key: 'mux-test',
            // @ts-expect-error refetchInterval is not allowed on stream queries
            refetchInterval: 1000,
          });
        };
        expect(constructQuery).toThrowError(/refetchInterval.*stream/i);
      });
    });
  });

  describe('Given a stream that yields nothing then completes', () => {
    describe('When the query pumps the iterator', () => {
      test('then loading becomes false and data stays []', async () => {
        async function* empty() {
          // never yields
        }
        const q = query(() => empty(), { key: 'empty-test' });

        await flushPromises();

        expect(q.loading.value).toBe(false);
        expect(q.data.value).toEqual([]);
        expect(q.error.value).toBeUndefined();
      });
    });
  });

  describe('Given a signal-aware stream thunk', () => {
    describe('When the query is constructed', () => {
      test('then the thunk receives a real AbortSignal it can subscribe to', async () => {
        let receivedSignal: AbortSignal | undefined;
        async function* echo(signal?: AbortSignal) {
          receivedSignal = signal;
          // Subscribing must not throw — proves we got a real AbortSignal,
          // not undefined.  (Phase 2 wires real abort on dispose; Phase 1
          // just needs the contract that signal-aware thunks don't crash.)
          signal?.addEventListener('abort', () => {});
          yield 'tick';
        }
        const q = query((sig) => echo(sig), { key: 'signal-test' });
        await flushPromises();
        expect(receivedSignal).toBeInstanceOf(AbortSignal);
        expect(receivedSignal?.aborted).toBe(false);
        expect(q.data.value).toEqual(['tick']);
      });
    });
  });

  describe('Given a tuple key', () => {
    describe('When two stream queries share the same tuple key shape', () => {
      test('then they serialize to the same internal cache key', async () => {
        // Smoke test: two queries with equivalent tuple keys should both work
        // and not throw on construction.  Cache-hit semantics for streams are
        // out of scope for v1 (non-goal in design doc), but the key shape must
        // be accepted.
        async function* s() {
          yield 1;
        }
        const q1 = query(() => s(), { key: ['session', 'abc', 'msgs'] as const });
        const q2 = query(() => s(), { key: ['session', 'abc', 'msgs'] as const });
        await flushPromises();
        expect(q1.data.value).toEqual([1]);
        expect(q2.data.value).toEqual([1]);
      });
    });
  });

  // ─── Phase 2: lifecycle ──────────────────────────────────────────

  describe('Given an iterator that respects AbortSignal', () => {
    describe('When dispose() is called mid-iteration', () => {
      test('then the signal aborts with QueryDisposedReason and no further yields land', async () => {
        let abortFired = false;
        let receivedSignal: AbortSignal | undefined;
        async function* infinite(signal?: AbortSignal) {
          receivedSignal = signal;
          signal?.addEventListener('abort', () => {
            abortFired = true;
          });
          let i = 0;
          while (true) {
            if (signal?.aborted) return;
            yield { id: String(i++) };
            await new Promise((r) => setTimeout(r, 10));
          }
        }
        const q = query((sig) => infinite(sig), { key: 'abort-test' });

        // Pump for ~25ms — should land at least 2 items.
        for (let i = 0; i < 30; i++) {
          vi.advanceTimersByTime(1);
          await Promise.resolve();
        }
        const before = q.data.value.length;
        expect(before).toBeGreaterThan(0);

        q.dispose();

        // Drain a few more pumps — no further items should land.
        for (let i = 0; i < 60; i++) {
          vi.advanceTimersByTime(1);
          await Promise.resolve();
        }
        expect(abortFired).toBe(true);
        expect(receivedSignal?.aborted).toBe(true);
        expect(receivedSignal?.reason).toBeInstanceOf(QueryDisposedReason);
        expect(q.data.value.length).toBe(before);
      });
    });
  });

  describe('Given a stream that has yielded once', () => {
    describe('When refetch() is called', () => {
      test('then data resets to [] and reconnecting flips true until next yield', async () => {
        let resolveNext: (() => void) | undefined;
        let invocation = 0;
        async function* slowStream() {
          invocation++;
          const tag = invocation;
          yield { id: `${tag}-1` };
          // Wait until externally released so refetch can observe reconnecting=true
          // before the next yield lands.
          await new Promise<void>((r) => {
            resolveNext = r;
          });
          yield { id: `${tag}-2` };
        }
        const q = query(() => slowStream(), { key: 'refetch-test' });

        await flushPromises();
        expect(q.data.value.map((x) => x.id)).toEqual(['1-1']);
        expect(q.reconnecting.value).toBe(false);

        q.refetch();

        // After refetch: data reset, reconnecting true, new iterator constructed.
        expect(q.data.value).toEqual([]);
        expect(q.reconnecting.value).toBe(true);

        // Release any stranded await on the first iterator (it was aborted but
        // its pending Promise still needs to resolve so the test runner doesn't
        // hold a reference).
        resolveNext?.();
        resolveNext = undefined;

        await flushPromises();
        // Second invocation produced its first item — reconnecting cleared.
        expect(q.data.value.map((x) => x.id)).toEqual(['2-1']);
        expect(q.reconnecting.value).toBe(false);
        // Release the second iterator so the test exits cleanly.
        resolveNext?.();
        await flushPromises();
        expect(q.data.value.map((x) => x.id)).toEqual(['2-1', '2-2']);
        expect(q.reconnecting.value).toBe(false);
      });
    });
  });

  describe('Given a stream backed by a reactive sessionId', () => {
    describe('When the sessionId changes', () => {
      test('then the previous iterator aborts and a new one starts for the new id', async () => {
        const sessionId = createSignal('s1');
        const opened: string[] = [];
        const aborted: string[] = [];
        async function* streamFor(id: string, signal?: AbortSignal) {
          opened.push(id);
          signal?.addEventListener('abort', () => {
            aborted.push(id);
          });
          yield { id: `${id}-msg-1` };
        }
        const q = query((sig) => streamFor(sessionId.value, sig), { key: 'reactive-key' });
        await flushPromises();
        expect(opened).toEqual(['s1']);
        expect(q.data.value.map((x) => x.id)).toEqual(['s1-msg-1']);

        sessionId.value = 's2';
        await flushPromises();

        expect(aborted).toEqual(['s1']);
        expect(opened).toEqual(['s1', 's2']);
        expect(q.data.value.map((x) => x.id)).toEqual(['s2-msg-1']);
      });
    });
  });

  describe('Given a stream that ignores the abort signal', () => {
    describe('When dispose() is called', () => {
      test('then yields stop landing in data anyway (defensive: pump checks signal between yields)', async () => {
        // Producer doesn't subscribe to signal — yields freely until completion.
        async function* leaky() {
          for (let i = 0; i < 5; i++) {
            yield { id: String(i) };
            await new Promise((r) => setTimeout(r, 5));
          }
        }
        const q = query(() => leaky(), { key: 'leaky-test' });
        // Let one item land.
        for (let i = 0; i < 8; i++) {
          vi.advanceTimersByTime(1);
          await Promise.resolve();
        }
        const before = q.data.value.length;
        expect(before).toBeGreaterThan(0);

        q.dispose();

        // Drain remaining producer yields — none should land in data.
        for (let i = 0; i < 60; i++) {
          vi.advanceTimersByTime(1);
          await Promise.resolve();
        }
        expect(q.data.value.length).toBe(before);
      });
    });
  });

  describe('Given a thunk that swaps source type between runs', () => {
    describe('When deps change so the thunk returns Promise after AsyncIterable', () => {
      test('then refetch throws QueryStreamMisuseError naming the swap', async () => {
        let mode: 'stream' | 'promise' = 'stream';
        async function* s() {
          yield 1;
        }
        const q = query(
          () =>
            mode === 'stream' ? s() : (Promise.resolve(2) as unknown as AsyncIterable<number>),
          { key: 'swap-test' },
        );
        await flushPromises();
        mode = 'promise';
        expect(() => q.refetch()).toThrowError(/source-type/i);
      });
    });
  });
});
