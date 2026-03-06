import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { ok } from '@vertz/fetch';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { signal } from '../../runtime/signal';
import type { DisposeFn } from '../../runtime/signal-types';
import {
  getEntityStore,
  getQueryEnvelopeStore,
  resetEntityStore,
} from '../../store/entity-store-singleton';
import { MemoryCache } from '../cache';
import { __inflightSize, query } from '../query';

describe('query()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns loading=true initially then resolves data', async () => {
    const result = query(() => Promise.resolve([1, 2, 3]));

    expect(result.loading.value).toBe(true);
    expect(result.data.value).toBeUndefined();
    expect(result.error.value).toBeUndefined();

    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.data.value).toEqual([1, 2, 3]);
    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeUndefined();
  });

  test('sets error signal on fetch failure', async () => {
    const err = new TypeError('network error');
    const result = query(() => Promise.reject(err));

    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.error.value).toBe(err);
    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(false);
  });

  test('refetch clears cache and re-executes', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'refetch-test' },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe(1);

    result.refetch();
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe(2);
    expect(callCount).toBe(2);
  });

  test('revalidate is an alias for refetch', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'revalidate-test' },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe(1);

    result.revalidate();
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe(2);
  });

  test('enabled=false skips fetching', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve('data');
      },
      { enabled: false },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(callCount).toBe(0);
    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(false);
  });

  test('initialData populates data without fetching', async () => {
    const result = query(
      () => {
        return Promise.resolve(['fetched']);
      },
      { initialData: ['cached'], key: 'initial-data-test' },
    );

    // Data should be available immediately
    expect(result.data.value).toEqual(['cached']);
    expect(result.loading.value).toBe(false);

    // The effect runs the thunk for tracking, but we skip executeFetch
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    // Should NOT have triggered a real fetch via executeFetch
    expect(result.data.value).toEqual(['cached']);
  });

  test('debounce delays re-fetch', async () => {
    const dep = signal(1);
    let fetchCount = 0;

    const result = query(
      () => {
        // Read the reactive dep to create a subscription
        const val = dep.value;
        fetchCount++;
        return Promise.resolve(`value-${val}`);
      },
      { debounce: 100, key: 'debounce-test' },
    );

    // Initial run: the effect calls the thunk for tracking, but debounce
    // prevents the immediate fetch. Wait for the debounce timer to fire.
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(result.data.value).toBe('value-1');
    const countsAfterInit = fetchCount;

    // Change the dep rapidly — debounce should coalesce updates.
    dep.value = 2;
    dep.value = 3;

    // After 50ms the debounced fetch should NOT have fired yet.
    vi.advanceTimersByTime(50);
    await Promise.resolve();
    expect(result.data.value).toBe('value-1');

    // After the full debounce window, the fetch fires with the latest dep value.
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(result.data.value).toBe('value-3');
    expect(fetchCount).toBeGreaterThan(countsAfterInit);
  });

  test('custom key overrides derived key', async () => {
    const result1 = query(() => Promise.resolve('a'), { key: 'shared' });
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    // A second query with the same custom key should deduplicate if in-flight
    // (here the first already resolved, so this is just a key test)
    const result2 = query(() => Promise.resolve('b'), { key: 'shared-other' });
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result1.data.value).toBe('a');
    expect(result2.data.value).toBe('b');
  });

  test('dispose stops reactive effect from re-running', async () => {
    const dep = signal(1);
    let fetchCount = 0;

    const result = query(
      () => {
        dep.value;
        fetchCount++;
        return Promise.resolve(fetchCount);
      },
      { key: 'dispose-test' },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe(1);
    const countAfterInit = fetchCount;

    // Dispose the query
    result.dispose();

    // Change dep — should NOT trigger a re-fetch
    dep.value = 2;
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(fetchCount).toBe(countAfterInit);
    expect(result.data.value).toBe(1);
  });

  test('dispose clears pending debounce timer', async () => {
    const dep = signal(1);
    let fetchCount = 0;

    const result = query(
      () => {
        dep.value;
        fetchCount++;
        return Promise.resolve(fetchCount);
      },
      { debounce: 100, key: 'dispose-debounce-test' },
    );

    // Wait for initial debounced fetch
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    const countAfterInit = fetchCount;

    // Change dep to trigger debounce
    dep.value = 2;

    // Dispose before debounce timer fires
    result.dispose();

    // Advance past debounce window — should NOT fetch
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    expect(fetchCount).toBe(countAfterInit + 1); // +1 for the tracking call, but no startFetch
  });

  test('dispose invalidates pending fetch responses', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const result = query(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
      { key: 'dispose-inflight-test' },
    );

    expect(result.loading.value).toBe(true);

    // Dispose while fetch is in-flight
    result.dispose();

    // Resolve the pending promise — should be ignored (stale)
    resolvers[0]?.('stale');
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    // Data should remain undefined since the response was invalidated
    expect(result.data.value).toBeUndefined();
  });

  test('debounce does not call thunk redundantly in setTimeout', async () => {
    const dep = signal(1);
    let fetchCount = 0;

    query(
      () => {
        const val = dep.value;
        fetchCount++;
        return Promise.resolve(`value-${val}`);
      },
      { debounce: 100, key: 'debounce-no-redundant-test' },
    );

    // Initial effect run calls thunk once for tracking
    const countAfterInit = fetchCount;
    expect(countAfterInit).toBe(1);

    // After debounce fires, startFetch uses the tracking promise —
    // thunk should NOT be called again
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchCount).toBe(countAfterInit); // No additional thunk call
  });

  test('derived cache key updates reactively when signal dependencies change', async () => {
    const filter = signal('a');
    const resolvers: Array<{ value: string; resolve: (v: string) => void }> = [];

    // No explicit key — uses deriveKey(thunk) internally
    const result = query(() => {
      const f = filter.value; // reactive dependency
      return new Promise<string>((resolve) => {
        resolvers.push({ value: f, resolve });
      });
    });

    // First fetch is in-flight with filter='a'
    expect(result.loading.value).toBe(true);
    expect(resolvers).toHaveLength(1);
    expect(resolvers[0]?.value).toBe('a');

    // Change the signal while the first fetch is still in-flight.
    // The effect should re-run and call the thunk with the NEW filter value,
    // NOT piggyback on the old in-flight request.
    filter.value = 'b';

    // The effect should have called the thunk again with filter='b'
    expect(resolvers).toHaveLength(2);
    expect(resolvers[1]?.value).toBe('b');

    // Resolve the first (now stale) fetch
    resolvers[0]?.resolve('data-for-a');
    await Promise.resolve();

    // Data should NOT be 'data-for-a' because that fetch is stale
    // (the fetchId check should ignore it)
    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(true);

    // Resolve the second (current) fetch
    resolvers[1]?.resolve('data-for-b');
    await Promise.resolve();

    expect(result.data.value).toBe('data-for-b');
    expect(result.loading.value).toBe(false);
  });

  test('stale responses are ignored after refetch', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const result = query(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
      { key: 'stale-test' },
    );

    // First fetch is in progress
    expect(result.loading.value).toBe(true);

    // Trigger refetch before first resolves
    result.refetch();

    // Now resolve the first (stale) promise
    resolvers[0]?.('stale');
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    // Data should still be undefined because the stale response is ignored
    // (the refetch created a new fetch ID)
    // The second promise is still pending
    expect(result.loading.value).toBe(true);

    // Resolve the second (current) promise
    resolvers[1]?.('fresh');
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.data.value).toBe('fresh');
    expect(result.loading.value).toBe(false);
  });

  test('cache entries are retained across reactive dependency changes', async () => {
    const cache = new MemoryCache<string>();
    const setSpy = vi.spyOn(cache, 'set');
    const filter = signal('a');
    const resolvers: Array<{ value: string; resolve: (v: string) => void }> = [];

    query(
      () => {
        const f = filter.value;
        return new Promise<string>((resolve) => {
          resolvers.push({ value: f, resolve });
        });
      },
      { cache },
    );

    // Resolve the first fetch (filter='a')
    resolvers[0]?.resolve('data-a');
    await Promise.resolve();
    const keyA = setSpy.mock.calls[0]?.[0] as string;

    // Change signal to 'b'
    filter.value = 'b';
    resolvers[1]?.resolve('data-b');
    await Promise.resolve();
    const keyB = setSpy.mock.calls[1]?.[0] as string;

    // Change signal to 'c'
    filter.value = 'c';
    resolvers[2]?.resolve('data-c');
    await Promise.resolve();
    const keyC = setSpy.mock.calls[2]?.[0] as string;

    // All three cache entries should still exist — old entries are NOT deleted
    expect(cache.get(keyA)).toBe('data-a');
    expect(cache.get(keyB)).toBe('data-b');
    expect(cache.get(keyC)).toBe('data-c');

    // All keys should be distinct (different dependency values)
    expect(new Set([keyA, keyB, keyC]).size).toBe(3);
  });

  test('dispose cleans all in-flight keys, not just the current version', async () => {
    const filter = signal('x');
    const resolvers: Array<{ value: string; resolve: (v: string) => void }> = [];

    const inflightBefore = __inflightSize();

    // Use a dedicated cache to avoid sharing entries with other tests.
    const cache = new MemoryCache<string>();
    const result = query(
      () => {
        const f = filter.value;
        return new Promise<string>((resolve) => {
          resolvers.push({ value: f, resolve });
        });
      },
      { cache },
    );

    // First fetch is in-flight
    expect(resolvers).toHaveLength(1);
    expect(__inflightSize()).toBe(inflightBefore + 1);

    // Change signal — creates second in-flight entry
    filter.value = 'y';
    expect(resolvers).toHaveLength(2);
    expect(__inflightSize()).toBe(inflightBefore + 2);

    // Change signal again — creates third in-flight entry
    filter.value = 'z';
    expect(resolvers).toHaveLength(3);
    expect(__inflightSize()).toBe(inflightBefore + 3);

    // Dispose should clean ALL in-flight entries, not just the current one
    result.dispose();

    // All 3 in-flight entries should be removed from the global map
    expect(__inflightSize()).toBe(inflightBefore);

    // Resolve all — none should update data (all invalidated)
    resolvers[0]?.resolve('data-x');
    resolvers[1]?.resolve('data-y');
    resolvers[2]?.resolve('data-z');
    await Promise.resolve();

    expect(result.data.value).toBeUndefined();
  });

  test('rapid triple signal change A->B->C resolves correctly', async () => {
    const filter = signal('A');
    const resolvers: Array<{ value: string; resolve: (v: string) => void }> = [];

    const result = query(() => {
      const f = filter.value;
      return new Promise<string>((resolve) => {
        resolvers.push({ value: f, resolve });
      });
    });

    // Rapid signal changes: A -> B -> C
    filter.value = 'B';
    filter.value = 'C';

    // Three thunk calls total (initial + 2 signal changes)
    expect(resolvers).toHaveLength(3);
    expect(resolvers[0]?.value).toBe('A');
    expect(resolvers[1]?.value).toBe('B');
    expect(resolvers[2]?.value).toBe('C');

    // Resolve in reverse order to test stale response handling
    resolvers[2]?.resolve('data-C');
    await Promise.resolve();
    expect(result.data.value).toBe('data-C');
    expect(result.loading.value).toBe(false);

    // Stale resolves should be ignored
    resolvers[1]?.resolve('data-B');
    resolvers[0]?.resolve('data-A');
    await Promise.resolve();

    // Data should still be 'data-C' — stale responses are dropped
    expect(result.data.value).toBe('data-C');
  });

  test('old cached data is retained when reactive dependency changes', async () => {
    const cache = new MemoryCache<string>();
    const setSpy = vi.spyOn(cache, 'set');
    const userId = signal(1);

    const result = query(
      () => {
        const id = userId.value;
        return Promise.resolve(`user-${id}`);
      },
      { cache },
    );

    // First fetch resolves with userId=1
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-1');

    // The cache should have an entry for the userId=1 key
    const firstSetKey = setSpy.mock.calls[0]?.[0] as string;
    expect(cache.get(firstSetKey)).toBe('user-1');

    // Change userId to 2 — triggers re-fetch
    userId.value = 2;
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-2');

    // The OLD cache entry for userId=1 should still be in the cache (not deleted)
    expect(cache.get(firstSetKey)).toBe('user-1');
  });

  test('cache key reflects actual signal values, not just a version counter', async () => {
    const cache = new MemoryCache<string>();
    const setSpy = vi.spyOn(cache, 'set');
    const getSpy = vi.spyOn(cache, 'get');
    const userId = signal(1);
    let fetchCount = 0;

    const result = query(
      () => {
        const id = userId.value;
        fetchCount++;
        return Promise.resolve(`user-${id}-fetch-${fetchCount}`);
      },
      { cache },
    );

    // First fetch: userId=1
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-1-fetch-1');
    const firstKey = setSpy.mock.calls[0]?.[0] as string;

    // Change to userId=2
    userId.value = 2;
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-2-fetch-2');
    const secondKey = setSpy.mock.calls[1]?.[0] as string;

    // Keys should be different for different signal values
    expect(firstKey).not.toBe(secondKey);

    // Change BACK to userId=1 — the cache key should match the original
    // key since the same signal values are being used. The data should be
    // served from the cache (no re-fetch needed).
    userId.value = 1;
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    // The data should be the ORIGINAL cached value for userId=1
    // (from the first fetch), not a new fetch result
    expect(result.data.value).toBe('user-1-fetch-1');

    // Verify the cache was consulted with the same key as the first fetch
    const getCalls = getSpy.mock.calls.map((c) => c[0]);
    expect(getCalls).toContain(firstKey);
  });

  test('switching back to a previously cached dependency serves cached data without re-fetch', async () => {
    const cache = new MemoryCache<string>();
    const userId = signal(1);
    let fetchCount = 0;

    const result = query(
      () => {
        const id = userId.value;
        fetchCount++;
        return Promise.resolve(`user-${id}`);
      },
      { cache },
    );

    // Fetch userId=1
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-1');
    expect(fetchCount).toBe(1);

    // Fetch userId=2
    userId.value = 2;
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-2');
    expect(fetchCount).toBe(2);

    // Switch back to userId=1 — should use cached data
    userId.value = 1;

    // The thunk will still be called (for tracking), but the cache should be
    // consulted and the data should be served from cache
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('user-1');
    // The thunk was called for tracking but startFetch should have been
    // skipped because the cache already has data for this key
  });

  test('new query instance serves from shared cache on mount (custom key)', async () => {
    const cache = new MemoryCache<string>();
    let fetchCount = 0;

    // First query instance — populates the cache
    const q1 = query(
      () => {
        fetchCount++;
        return Promise.resolve('cached-data');
      },
      { key: 'shared-key', cache },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(q1.data.value).toBe('cached-data');
    expect(fetchCount).toBe(1);

    // Dispose first query (simulates page unmount)
    q1.dispose();

    // Second query instance with the same custom key and shared cache
    // should serve from cache immediately — no loading flash, no re-fetch
    const q2 = query(
      () => {
        fetchCount++;
        return Promise.resolve('fresh-data');
      },
      { key: 'shared-key', cache },
    );

    // Should be populated from cache immediately, not loading
    expect(q2.data.value).toBe('cached-data');
    expect(q2.loading.value).toBe(false);
    // Thunk is called for dep tracking, but startFetch is skipped (cache hit).
    // The data should be the CACHED value, not the fresh thunk result.
    expect(q2.data.value).not.toBe('fresh-data');

    q2.dispose();
  });

  test('uses descriptor _key as cache key', async () => {
    const descriptor = {
      _tag: 'QueryDescriptor' as const,
      _key: 'GET:/tasks',
      _fetch: () => Promise.resolve(ok([1, 2, 3])),
      // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
      then(onFulfilled: any, onRejected: any) {
        return this._fetch().then(onFulfilled, onRejected);
      },
    };

    const result = query(descriptor);

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(result.data.value).toEqual([1, 2, 3]);
    expect(result.loading.value).toBe(false);
  });

  test('calls descriptor _fetch function', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok('fetched-data'));
    const descriptor = {
      _tag: 'QueryDescriptor' as const,
      _key: 'GET:/tasks/1',
      _fetch: fetchFn,
      // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
      then(onFulfilled: any, onRejected: any) {
        return this._fetch().then(onFulfilled, onRejected);
      },
    };

    query(descriptor);

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchFn).toHaveBeenCalled();
  });

  test('enabled: false does not fetch with descriptor', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok('data'));
    const descriptor = {
      _tag: 'QueryDescriptor' as const,
      _key: 'GET:/tasks',
      _fetch: fetchFn,
      // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
      then(onFulfilled: any, onRejected: any) {
        return this._fetch().then(onFulfilled, onRejected);
      },
    };

    const result = query(descriptor, { enabled: false });

    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.data.value).toBeUndefined();
    expect(result.loading.value).toBe(false);
  });

  test('backward compat: query(thunk) still works', async () => {
    const result = query(() => Promise.resolve('thunk-data'), { key: 'compat-test' });

    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.data.value).toBe('thunk-data');
    expect(result.loading.value).toBe(false);
  });

  test('debounce discard does not cause unhandled promise rejection', async () => {
    const filter = signal('a');

    // If unhandled rejections occur, this listener will catch them
    const unhandledRejections: unknown[] = [];

    // Use process-level listener for bun
    const processHandler = (_reason: unknown) => {
      unhandledRejections.push(_reason);
    };
    process.on('unhandledRejection', processHandler);

    try {
      const result = query(
        () => {
          const f = filter.value;
          return Promise.reject(new Error(`rejected-${f}`));
        },
        { debounce: 100 },
      );

      // Rapid signal changes while debounced — each discarded thunk promise
      // should NOT produce an unhandled rejection
      filter.value = 'b';
      filter.value = 'c';

      // Give microtasks time to propagate
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // No unhandled rejections should have occurred
      expect(unhandledRejections).toHaveLength(0);

      result.dispose();
    } finally {
      process.removeListener('unhandledRejection', processHandler);
    }
  });

  test('auto-disposes when parent disposal scope is cleaned up', async () => {
    const dep = signal(1);
    let fetchCount = 0;

    const scope = pushScope();
    const result = query(
      () => {
        dep.value;
        fetchCount++;
        return Promise.resolve(fetchCount);
      },
      { key: 'auto-dispose-test' },
    );
    popScope();

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe(1);
    const countAfterInit = fetchCount;

    // Clean up the scope — should auto-dispose the query
    runCleanups(scope);

    // Change dep — should NOT trigger a re-fetch
    dep.value = 2;
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(fetchCount).toBe(countAfterInit);
    expect(result.data.value).toBe(1);
  });

  test('auto-dispose cleans up in-flight entries from the global map', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const inflightBefore = __inflightSize();

    const scope = pushScope();
    const result = query(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
      { key: 'auto-dispose-inflight-test' },
    );
    popScope();

    expect(result.loading.value).toBe(true);
    expect(__inflightSize()).toBe(inflightBefore + 1);

    // Clean up the scope — should remove in-flight entries
    runCleanups(scope);
    expect(__inflightSize()).toBe(inflightBefore);

    // Resolve the pending promise — should be ignored (stale)
    resolvers[0]?.('stale');
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBeUndefined();
  });

  test('auto-dispose preserves cache entries for future queries', async () => {
    const cache = new MemoryCache<string>();

    const scope = pushScope();
    const q1 = query(() => Promise.resolve('cached-value'), {
      key: 'auto-dispose-cache-test',
      cache,
    });
    popScope();

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(q1.data.value).toBe('cached-value');

    // Clean up scope — auto-disposes query but cache should survive
    runCleanups(scope);

    // Cache entry should still exist
    expect(cache.get('auto-dispose-cache-test')).toBe('cached-value');

    // A new query with the same key should serve from cache immediately
    const q2 = query(() => Promise.resolve('fresh-value'), {
      key: 'auto-dispose-cache-test',
      cache,
    });

    expect(q2.data.value).toBe('cached-value');
    expect(q2.loading.value).toBe(false);
    q2.dispose();
  });

  test('revalidating is false on initial load', async () => {
    const result = query(() => Promise.resolve('data'), { key: 'reval-init-test' });

    // Initially loading, not revalidating
    expect(result.loading.value).toBe(true);
    expect(result.revalidating.value).toBe(false);

    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.data.value).toBe('data');
    expect(result.loading.value).toBe(false);
    expect(result.revalidating.value).toBe(false);
  });

  test('revalidating is true when refetching with existing data', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const result = query(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
      { key: 'reval-refetch-test' },
    );

    // Resolve initial fetch
    expect(resolvers).toHaveLength(1);
    resolvers[0]!('first');
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('first');
    expect(result.loading.value).toBe(false);
    expect(result.revalidating.value).toBe(false);

    // Trigger refetch — data exists, so revalidating=true, loading=false
    result.refetch();

    expect(result.revalidating.value).toBe(true);
    expect(result.loading.value).toBe(false);
    // Stale data remains visible
    expect(result.data.value).toBe('first');

    // Resolve the refetch
    resolvers[1]!('second');
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.data.value).toBe('second');
    expect(result.revalidating.value).toBe(false);
    expect(result.loading.value).toBe(false);
  });

  test('no-op when query is created outside a disposal scope', async () => {
    // No pushScope — query should still work without error
    const result = query(() => Promise.resolve('standalone'), { key: 'no-scope-test' });

    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(result.data.value).toBe('standalone');
    expect(result.loading.value).toBe(false);

    // Manual dispose still works
    result.dispose();
  });

  // ── refetchInterval ─────────────────────────────────────────

  test('refetchInterval polls at the specified interval', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(`call-${callCount}`);
      },
      { key: 'interval-basic', refetchInterval: 3000 },
    );

    // Initial fetch
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('call-1');
    expect(callCount).toBe(1);

    // After 3s, should poll again
    vi.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(2);
    expect(result.data.value).toBe('call-2');

    // After another 3s, should poll again
    vi.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(3);
    expect(result.data.value).toBe('call-3');

    result.dispose();
  });

  test('refetchInterval: false disables polling', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'interval-false', refetchInterval: false },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(callCount).toBe(1);

    // Wait a long time — should NOT poll
    vi.advanceTimersByTime(30000);
    await Promise.resolve();
    expect(callCount).toBe(1);

    result.dispose();
  });

  test('refetchInterval: 0 disables polling', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'interval-zero', refetchInterval: 0 },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(callCount).toBe(1);

    vi.advanceTimersByTime(30000);
    await Promise.resolve();
    expect(callCount).toBe(1);

    result.dispose();
  });

  test('dispose stops polling', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'interval-dispose', refetchInterval: 1000 },
    );

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(callCount).toBe(1);

    // Dispose before the interval fires
    result.dispose();

    // Advance past multiple intervals — should NOT poll
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  test('polling does not stack when fetch takes longer than interval', async () => {
    let callCount = 0;
    const resolvers: Array<(v: string) => void> = [];

    const result = query(
      () => {
        callCount++;
        return new Promise<string>((resolve) => {
          resolvers.push(resolve);
        });
      },
      { key: 'interval-no-stack', refetchInterval: 1000 },
    );

    // Initial fetch is in-flight (unresolved)
    expect(callCount).toBe(1);

    // Advance past multiple intervals — should NOT poll while in-flight
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(callCount).toBe(1); // Still only the initial fetch

    // Resolve the initial fetch — NOW the interval should start
    resolvers[0]!('first');
    await Promise.resolve();
    expect(result.data.value).toBe('first');

    // After 1s, should poll
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(callCount).toBe(2);

    // Resolve the poll
    resolvers[1]!('second');
    await Promise.resolve();
    expect(result.data.value).toBe('second');

    result.dispose();
  });

  test('polling pauses when tab is hidden and resumes when visible', async () => {
    // Mock document.visibilityState
    let visibilityState = 'visible';
    const listeners: Array<() => void> = [];
    const origDocument = globalThis.document;

    Object.defineProperty(globalThis, 'document', {
      value: {
        visibilityState: 'visible',
        addEventListener: (event: string, handler: () => void) => {
          if (event === 'visibilitychange') listeners.push(handler);
        },
        removeEventListener: (event: string, handler: () => void) => {
          if (event === 'visibilitychange') {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
          }
        },
      },
      configurable: true,
      writable: true,
    });

    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(`call-${callCount}`);
      },
      { key: 'interval-visibility', refetchInterval: 1000 },
    );

    // Initial fetch
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(callCount).toBe(1);

    // Hide the tab
    visibilityState = 'hidden';
    (globalThis.document as any).visibilityState = 'hidden';
    for (const fn of listeners) fn();

    // Advance past multiple intervals — should NOT poll
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(callCount).toBe(1);

    // Show the tab
    visibilityState = 'visible';
    (globalThis.document as any).visibilityState = 'visible';
    for (const fn of listeners) fn();

    // Should immediately refetch on becoming visible
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(2);

    result.dispose();

    // Restore document
    Object.defineProperty(globalThis, 'document', {
      value: origDocument,
      configurable: true,
      writable: true,
    });
  });

  test('auto-dispose via scope cleanup stops polling', async () => {
    let callCount = 0;

    const scope = pushScope();
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'interval-auto-dispose', refetchInterval: 1000 },
    );
    popScope();

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(callCount).toBe(1);

    // Clean up the scope — should stop polling
    runCleanups(scope);

    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(callCount).toBe(1);
  });

  test('in-flight poll does not cause errors when disposed', async () => {
    const resolvers: Array<(v: string) => void> = [];

    const result = query(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
      { key: 'interval-inflight-dispose', refetchInterval: 1000 },
    );

    // Resolve initial fetch to start the interval
    resolvers[0]!('first');
    await Promise.resolve();
    expect(result.data.value).toBe('first');

    // Trigger the interval poll
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    // Poll is now in-flight (unresolved)

    // Dispose while poll is in-flight — should not throw
    result.dispose();

    // Resolve the in-flight poll — should be silently ignored (stale)
    resolvers[1]!('stale');
    await Promise.resolve();
    expect(result.data.value).toBe('first');
  });

  test('polling continues after a failed fetch', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('transient'));
        return Promise.resolve(`call-${callCount}`);
      },
      { key: 'interval-error-recovery', refetchInterval: 1000 },
    );

    // Initial fetch succeeds
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('call-1');

    // Second fetch (poll) fails
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.error.value).toBeInstanceOf(Error);

    // Third fetch (poll) should still happen — polling continues
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(3);
    expect(result.data.value).toBe('call-3');

    result.dispose();
  });

  test('enabled: false with refetchInterval does not poll', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount);
      },
      { key: 'interval-disabled', refetchInterval: 1000, enabled: false },
    );

    vi.advanceTimersByTime(10000);
    await Promise.resolve();
    expect(callCount).toBe(0);

    result.dispose();
  });

  test('refetchInterval starts polling even with initialData', async () => {
    let callCount = 0;
    const result = query(
      () => {
        callCount++;
        return Promise.resolve(`call-${callCount}`);
      },
      { key: 'interval-initial-data', refetchInterval: 1000, initialData: 'seed' },
    );

    // Initial data is served immediately, no fetch
    expect(result.data.value).toBe('seed');
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    // After 1s, should poll even though initialData was provided
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBeGreaterThanOrEqual(1);
    expect(result.data.value).not.toBe('seed');

    result.dispose();
  });

  test('reactive dep change resets the interval timer', async () => {
    const dep = signal('a');
    let callCount = 0;
    const result = query(
      () => {
        const d = dep.value;
        callCount++;
        return Promise.resolve(`${d}-${callCount}`);
      },
      { refetchInterval: 2000 },
    );

    // Initial fetch
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('a-1');

    // After 1s (halfway through interval), change the dep
    vi.advanceTimersByTime(1000);
    dep.value = 'b';
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('b-2');

    // The old interval timer (from the 'a' fetch) should NOT fire at t=2s.
    // Only the new interval timer (from the 'b' fetch) at t=1s+2s=3s should fire.
    vi.advanceTimersByTime(1000); // t=2s
    await Promise.resolve();
    await Promise.resolve();
    const countAt2s = callCount;

    vi.advanceTimersByTime(1000); // t=3s — new interval should fire
    await Promise.resolve();
    await Promise.resolve();
    expect(callCount).toBe(countAt2s + 1);

    result.dispose();
  });

  test('refetchInterval function receives data and iteration count', async () => {
    const intervals: Array<{ data: string | undefined; iteration: number }> = [];
    let callCount = 0;

    const result = query(
      () => {
        callCount++;
        return Promise.resolve(`call-${callCount}`);
      },
      {
        key: 'interval-fn',
        refetchInterval: (data, iteration) => {
          intervals.push({ data, iteration });
          // Exponential backoff: 1s, 2s, 4s
          return 1000 * 2 ** iteration;
        },
      },
    );

    // Initial fetch
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('call-1');
    // First schedule: iteration=0, data='call-1' → 1000ms
    expect(intervals[0]).toEqual({ data: 'call-1', iteration: 0 });

    // After 1s, poll fires
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.data.value).toBe('call-2');
    // Second schedule: iteration=1, data='call-2' → 2000ms
    expect(intervals[1]).toEqual({ data: 'call-2', iteration: 1 });

    // After 2s, poll fires
    vi.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.data.value).toBe('call-3');
    // Third schedule: iteration=2, data='call-3' → 4000ms
    expect(intervals[2]).toEqual({ data: 'call-3', iteration: 2 });

    result.dispose();
  });

  test('refetchInterval function returning false stops polling', async () => {
    let callCount = 0;

    const result = query(
      () => {
        callCount++;
        return Promise.resolve(callCount >= 3 ? 'done' : 'pending');
      },
      {
        key: 'interval-fn-stop',
        refetchInterval: (data) => {
          if (data === 'done') return false;
          return 1000;
        },
      },
    );

    // Initial fetch → 'pending'
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(result.data.value).toBe('pending');

    // Poll 1 → 'pending'
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.data.value).toBe('pending');

    // Poll 2 → 'done' → function returns false → polling stops
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.data.value).toBe('done');

    // No more polls
    vi.advanceTimersByTime(10000);
    await Promise.resolve();
    expect(callCount).toBe(3);

    result.dispose();
  });

  test('iteration resets to 0 after refetchInterval returns false', async () => {
    let callCount = 0;
    const iterations: number[] = [];

    const result = query(
      () => {
        callCount++;
        // Stop after 2 polls, then manual refetch restarts
        return Promise.resolve(callCount === 2 ? 'done' : 'pending');
      },
      {
        key: 'interval-fn-reset',
        refetchInterval: (data, iteration) => {
          iterations.push(iteration);
          if (data === 'done') return false;
          return 1000;
        },
      },
    );

    // Initial fetch
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(iterations).toEqual([0]); // iteration=0

    // Poll → 'done' → false → stops
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.data.value).toBe('done');
    expect(iterations).toEqual([0, 1]); // iteration=1, returned false

    // Manual refetch → restarts polling
    callCount = 0; // reset so next call returns 'pending'
    result.refetch();
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();

    // Iteration should have reset to 0
    expect(iterations[2]).toBe(0);

    result.dispose();
  });

  describe('entity-backed queries', () => {
    beforeEach(() => {
      resetEntityStore();
    });

    test('get descriptor with _entity normalizes data into EntityStore', async () => {
      const descriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos/1',
        _entity: { entityType: 'todos', kind: 'get' as const, id: '1' },
        _fetch: () => Promise.resolve(ok({ id: '1', title: 'Buy milk', completed: false })),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const result = query(descriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();

      // Data should be populated
      expect(result.data.value).toEqual({ id: '1', title: 'Buy milk', completed: false });

      // Entity should be in the store
      const store = getEntityStore();
      expect(store.has('todos', '1')).toBe(true);
      expect(store.get('todos', '1').peek()).toEqual({
        id: '1',
        title: 'Buy milk',
        completed: false,
      });

      result.dispose();
    });

    test('entity-backed query data updates when EntityStore changes via applyLayer', async () => {
      const descriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos/2',
        _entity: { entityType: 'todos', kind: 'get' as const, id: '2' },
        _fetch: () => Promise.resolve(ok({ id: '2', title: 'Buy milk', completed: false })),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const result = query(descriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(result.data.value).toEqual({ id: '2', title: 'Buy milk', completed: false });

      // Apply optimistic layer
      const store = getEntityStore();
      store.applyLayer('todos', '2', 'm_1', { completed: true });

      // Query data should reflect the optimistic update
      expect(result.data.value).toEqual({ id: '2', title: 'Buy milk', completed: true });

      result.dispose();
    });

    test('list descriptor normalizes items into EntityStore', async () => {
      const descriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos',
        _entity: { entityType: 'todos', kind: 'list' as const },
        _fetch: () =>
          Promise.resolve(
            ok({
              items: [
                { id: '10', title: 'First', completed: false },
                { id: '11', title: 'Second', completed: true },
              ],
              total: 2,
            }),
          ),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const result = query(descriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();

      // List data should be the items array
      const data = result.data.value as any[];
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({ id: '10', title: 'First', completed: false });
      expect(data[1]).toEqual({ id: '11', title: 'Second', completed: true });

      // Both entities should be in the store
      const store = getEntityStore();
      expect(store.has('todos', '10')).toBe(true);
      expect(store.has('todos', '11')).toBe(true);

      result.dispose();
    });

    test('list + get queries — applying layer updates both', async () => {
      const listDescriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos-shared',
        _entity: { entityType: 'shared-todos', kind: 'list' as const },
        _fetch: () =>
          Promise.resolve(
            ok({
              items: [
                { id: '20', title: 'Buy milk', completed: false },
                { id: '21', title: 'Walk dog', completed: false },
              ],
              total: 2,
            }),
          ),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const getDescriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos-shared/20',
        _entity: { entityType: 'shared-todos', kind: 'get' as const, id: '20' },
        _fetch: () => Promise.resolve(ok({ id: '20', title: 'Buy milk', completed: false })),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const listResult = query(listDescriptor);
      const getResult = query(getDescriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();

      // Both queries should have data
      expect((listResult.data.value as any[])?.length).toBe(2);
      expect(getResult.data.value).toEqual({ id: '20', title: 'Buy milk', completed: false });

      // Apply optimistic layer to entity '20'
      const store = getEntityStore();
      store.applyLayer('shared-todos', '20', 'm_shared', { completed: true });

      // Both queries should reflect the change
      expect(getResult.data.value).toEqual({ id: '20', title: 'Buy milk', completed: true });
      const listItems = listResult.data.value as any[];
      expect(listItems[0]).toEqual({ id: '20', title: 'Buy milk', completed: true });
      expect(listItems[1]).toEqual({ id: '21', title: 'Walk dog', completed: false });

      listResult.dispose();
      getResult.dispose();
    });

    test('list query stores envelope metadata', async () => {
      const descriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos-envelope',
        _entity: { entityType: 'todos', kind: 'list' as const },
        _fetch: () =>
          Promise.resolve(
            ok({
              items: [
                { id: '40', title: 'Item A', completed: false },
                { id: '41', title: 'Item B', completed: true },
              ],
              total: 42,
              limit: 10,
              nextCursor: 'cursor_abc',
              hasNextPage: true,
            }),
          ),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const result = query(descriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();

      // Envelope metadata should be stored
      const envelopeStore = getQueryEnvelopeStore();
      const envelope = envelopeStore.get('GET:/todos-envelope');
      expect(envelope).toEqual({
        total: 42,
        limit: 10,
        nextCursor: 'cursor_abc',
        hasNextPage: true,
      });

      result.dispose();
    });

    test('entity persists in store after query disposal', async () => {
      const descriptor = {
        _tag: 'QueryDescriptor' as const,
        _key: 'GET:/todos/30',
        _entity: { entityType: 'todos', kind: 'get' as const, id: '30' },
        _fetch: () => Promise.resolve(ok({ id: '30', title: 'Persist me', completed: false })),
        // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };

      const result = query(descriptor);

      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(result.data.value).toEqual({ id: '30', title: 'Persist me', completed: false });

      // Dispose the query
      result.dispose();

      // Entity should still be in the store
      const store = getEntityStore();
      expect(store.has('todos', '30')).toBe(true);
      expect(store.get('todos', '30').peek()).toEqual({
        id: '30',
        title: 'Persist me',
        completed: false,
      });
    });
  });
});
