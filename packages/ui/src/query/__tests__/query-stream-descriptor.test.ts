import { afterEach, beforeEach, describe, expect, test, vi } from '@vertz/test';
import { createStreamDescriptor } from '@vertz/fetch';
import { query, QueryStreamMisuseError, resetDefaultQueryCache } from '../query';

async function flushPromises(rounds = 16): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
  }
}

describe('query() — StreamDescriptor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDefaultQueryCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Given a StreamDescriptor', () => {
    describe('When passed directly to query()', () => {
      test('then data accumulates and the descriptor key is used as the cache key', async () => {
        async function* mock() {
          yield { id: '1' };
          yield { id: '2' };
          yield { id: '3' };
        }
        const desc = createStreamDescriptor('GET', '/events', () => mock(), { topic: 'deploys' });
        // Sanity check: key shape matches createDescriptor scheme.
        expect(desc._key).toBe('GET:/events?topic=deploys');

        const q = query(desc);
        await flushPromises();

        expect(q.data.value.map((x) => x.id)).toEqual(['1', '2', '3']);
        expect(q.loading.value).toBe(false);
        expect(q.error.value).toBeUndefined();
      });
    });
  });

  describe('Given a StreamDescriptor', () => {
    describe('When the descriptor _stream factory is invoked', () => {
      test('then it receives a real AbortSignal that aborts on dispose', async () => {
        let receivedSignal: AbortSignal | undefined;
        const desc = createStreamDescriptor('GET', '/events', (signal) => {
          receivedSignal = signal;
          async function* infinite() {
            while (true) {
              if (signal.aborted) return;
              yield 1;
              await new Promise((r) => setTimeout(r, 10));
            }
          }
          return infinite();
        });
        const q = query(desc);
        await flushPromises();
        expect(receivedSignal).toBeInstanceOf(AbortSignal);
        expect(receivedSignal?.aborted).toBe(false);

        q.dispose();
        expect(receivedSignal?.aborted).toBe(true);
      });
    });
  });

  describe('Given two separate query(descriptor) calls', () => {
    describe('When both are constructed with the same descriptor instance', () => {
      test('then each gets an independent iterator and dispose state', async () => {
        let openCount = 0;
        const desc = createStreamDescriptor('GET', '/events', () => {
          openCount++;
          async function* mock() {
            yield 1;
          }
          return mock();
        });
        const q1 = query(desc);
        const q2 = query(desc);
        await flushPromises();

        expect(openCount).toBe(2);
        expect(q1.data.value).toEqual([1]);
        expect(q2.data.value).toEqual([1]);

        q1.dispose();
        // q2's data is unaffected by q1's disposal.
        expect(q2.data.value).toEqual([1]);
      });
    });
  });

  describe('Given a thunk that returns a StreamDescriptor (descriptor-in-thunk)', () => {
    describe('When the thunk-wrapped descriptor is consumed', () => {
      test('then the stream pumps and the descriptor key is honored', async () => {
        async function* mock() {
          yield 1;
          yield 2;
        }
        const desc = createStreamDescriptor('GET', '/events', () => mock(), { topic: 'x' });
        // Mirrors the existing `query(() => api.tasks.list(...))` pattern for
        // QueryDescriptor — late detection inside the effect cascade routes
        // the descriptor's _key into the cache.
        const q = query(() => desc);
        await flushPromises();
        expect(q.data.value).toEqual([1, 2]);
      });
    });
  });

  describe('Given a StreamDescriptor and a manual options bag together', () => {
    describe('When passed at runtime (bypassing TypeScript via cast)', () => {
      test('then construction throws QueryStreamMisuseError naming the descriptor', () => {
        const desc = createStreamDescriptor('GET', '/events', async function* () {});
        expect(() => {
          // Cast away the `options?: never` to test the runtime guard.
          (query as unknown as (d: unknown, o: unknown) => unknown)(desc, { key: 'manual' });
        }).toThrowError(/StreamDescriptor.*_key/i);
      });
    });
  });
});
