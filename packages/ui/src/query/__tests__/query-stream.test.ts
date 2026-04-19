import { afterEach, beforeEach, describe, expect, test, vi } from '@vertz/test';
import { resetDefaultQueryCache } from '../query';
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
      test('then construction throws a usage error naming both options', async () => {
        async function* s() {
          yield 1;
        }
        // refetchInterval is incompatible with stream sources.
        // The throw fires inside the first effect tick, so we need to flush
        // microtasks to surface it.
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
});
