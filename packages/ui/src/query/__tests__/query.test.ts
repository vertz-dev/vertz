import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { signal } from '../../runtime/signal';
import { query } from '../query';

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

    await vi.advanceTimersByTimeAsync(0);

    expect(result.data.value).toEqual([1, 2, 3]);
    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeUndefined();
  });

  test('sets error signal on fetch failure', async () => {
    const err = new TypeError('network error');
    const result = query(() => Promise.reject(err));

    await vi.advanceTimersByTimeAsync(0);

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

    await vi.advanceTimersByTimeAsync(0);
    expect(result.data.value).toBe(1);

    result.refetch();
    await vi.advanceTimersByTimeAsync(0);
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

    await vi.advanceTimersByTimeAsync(0);
    expect(result.data.value).toBe(1);

    result.revalidate();
    await vi.advanceTimersByTimeAsync(0);
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

    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(100);
    expect(result.data.value).toBe('value-1');
    const countsAfterInit = fetchCount;

    // Change the dep rapidly — debounce should coalesce updates.
    dep.value = 2;
    dep.value = 3;

    // After 50ms the debounced fetch should NOT have fired yet.
    await vi.advanceTimersByTimeAsync(50);
    expect(result.data.value).toBe('value-1');

    // After the full debounce window, the fetch fires with the latest dep value.
    await vi.advanceTimersByTimeAsync(100);
    expect(result.data.value).toBe('value-3');
    expect(fetchCount).toBeGreaterThan(countsAfterInit);
  });

  test('custom key overrides derived key', async () => {
    const result1 = query(() => Promise.resolve('a'), { key: 'shared' });
    await vi.advanceTimersByTimeAsync(0);

    // A second query with the same custom key should deduplicate if in-flight
    // (here the first already resolved, so this is just a key test)
    const result2 = query(() => Promise.resolve('b'), { key: 'shared-other' });
    await vi.advanceTimersByTimeAsync(0);

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

    await vi.advanceTimersByTimeAsync(0);
    expect(result.data.value).toBe(1);
    const countAfterInit = fetchCount;

    // Dispose the query
    result.dispose();

    // Change dep — should NOT trigger a re-fetch
    dep.value = 2;
    await vi.advanceTimersByTimeAsync(0);

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
    await vi.advanceTimersByTimeAsync(100);
    const countAfterInit = fetchCount;

    // Change dep to trigger debounce
    dep.value = 2;

    // Dispose before debounce timer fires
    result.dispose();

    // Advance past debounce window — should NOT fetch
    await vi.advanceTimersByTimeAsync(200);

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
    await vi.advanceTimersByTimeAsync(0);

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
    await vi.advanceTimersByTimeAsync(100);
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
    await vi.advanceTimersByTimeAsync(0);

    // Data should still be undefined because the stale response is ignored
    // (the refetch created a new fetch ID)
    // The second promise is still pending
    expect(result.loading.value).toBe(true);

    // Resolve the second (current) promise
    resolvers[1]?.('fresh');
    await vi.advanceTimersByTimeAsync(0);

    expect(result.data.value).toBe('fresh');
    expect(result.loading.value).toBe(false);
  });
});
