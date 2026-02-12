import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { query } from '../query/query';
import { signal } from '../runtime/signal';

describe('Integration Tests — Query Data Fetching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // IT-4-1: query() returns loading then data
  test('query() returns loading then data', async () => {
    const users = query(() => Promise.resolve([{ id: 1, name: 'Alice' }]), {
      key: 'it-4-1',
    });

    // Initially loading
    expect(users.loading.value).toBe(true);
    expect(users.data.value).toBeUndefined();

    // After promise settles
    await vi.advanceTimersByTimeAsync(0);

    expect(users.loading.value).toBe(false);
    expect(users.data.value).toEqual([{ id: 1, name: 'Alice' }]);
    expect(users.error.value).toBeUndefined();
  });

  // IT-4-2: query() refetches when reactive dependency changes
  test('query() refetches when reactive dependency changes', async () => {
    const page = signal(1);
    let fetchCount = 0;

    const result = query(
      () => {
        const p = page.value;
        fetchCount++;
        return Promise.resolve({ page: p, items: [`item-${p}`] });
      },
      { key: 'it-4-2' },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(result.data.value).toEqual({ page: 1, items: ['item-1'] });
    const countAfterFirst = fetchCount;

    // Change the reactive dependency
    page.value = 2;

    await vi.advanceTimersByTimeAsync(0);
    expect(result.data.value).toEqual({ page: 2, items: ['item-2'] });
    expect(fetchCount).toBeGreaterThan(countAfterFirst);
  });

  // IT-4-3: Concurrent identical queries produce single fetch (deduplication)
  test('concurrent identical queries produce single fetch (deduplication)', async () => {
    let fetchCount = 0;

    const fetcher = () => {
      fetchCount++;
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve('result'), 100);
      });
    };

    // Launch two queries with the same key simultaneously
    const q1 = query(fetcher, { key: 'it-4-3-dedup' });
    const q2 = query(fetcher, { key: 'it-4-3-dedup' });

    // Both should be loading
    expect(q1.loading.value).toBe(true);
    expect(q2.loading.value).toBe(true);

    // The fetcher should only have been called once due to deduplication
    // (The first query starts the fetch, the second piggybacks on the in-flight promise)
    expect(fetchCount).toBe(1);

    // Advance past the setTimeout in the fetcher
    await vi.advanceTimersByTimeAsync(100);

    expect(q1.data.value).toBe('result');
    expect(q2.data.value).toBe('result');
  });

  // IT-4-4: initialData skips the initial fetch
  test('initialData skips the initial fetch', async () => {
    const result = query(() => Promise.resolve(['server-data']), {
      initialData: ['ssr-data'],
      key: 'it-4-4',
    });

    // Data is immediately available from initialData
    expect(result.data.value).toEqual(['ssr-data']);
    expect(result.loading.value).toBe(false);

    // Wait for any async effects to settle
    await vi.advanceTimersByTimeAsync(0);

    // The thunk may have been called by the effect for tracking purposes,
    // but the data should remain the initialData (executeFetch was skipped)
    expect(result.data.value).toEqual(['ssr-data']);
  });
});
