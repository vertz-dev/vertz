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
