import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createDescriptor } from '@vertz/fetch';
import { signal } from '../../runtime/signal';
import type { SSRRenderContext } from '../../ssr/ssr-render-context';
import { disableTestSSR, enableTestSSR } from '../../ssr/test-ssr-helpers';
import { MemoryCache } from '../cache';
import { hashString } from '../key-derivation';
import { query } from '../query';

describe('query() SSR behavior', () => {
  let ctx: SSRRenderContext;

  beforeEach(() => {
    ctx = enableTestSSR();
  });

  afterEach(() => {
    disableTestSSR();
  });

  it('registers a query promise with SSR context during SSR', () => {
    query(() => Promise.resolve('data'), { key: 'ssr-test' });

    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.timeout).toBe(300); // default timeout matches plugin default
    expect(ctx.queries[0]?.promise).toBeInstanceOf(Promise);
  });

  it('uses custom ssrTimeout when provided', () => {
    query(() => Promise.resolve('data'), { key: 'ssr-timeout-test', ssrTimeout: 50 });

    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.timeout).toBe(50);
  });

  it('does not register when ssrTimeout is 0', () => {
    query(() => Promise.resolve('data'), { key: 'ssr-disabled-test', ssrTimeout: 0 });

    expect(ctx.queries).toHaveLength(0);
  });

  it('resolve callback updates data and loading signals', async () => {
    const result = query<string>(() => Promise.resolve('server-data'), {
      key: 'ssr-resolve-test',
    });

    expect(ctx.queries).toHaveLength(1);

    // Simulate what renderToHTML does: await the promise, then call resolve
    ctx.queries[0]?.resolve('server-data');

    expect(result.data.value).toBe('server-data');
    expect(result.loading.value).toBe(false);
    expect(result.idle.value).toBe(false);
  });

  it('does not register SSR promise when thunk returns null', () => {
    const result = query(() => null as Promise<string> | null, {
      key: 'ssr-disabled-query',
    });

    expect(ctx.queries).toHaveLength(0);
    // SSR null-return must reset loading to false (no hydration flash)
    expect(result.loading.value).toBe(false);
    // idle stays true — no fetch has occurred
    expect(result.idle.value).toBe(true);
  });

  it('multiple queries register independently in parallel', () => {
    query(() => Promise.resolve('a'), { key: 'ssr-multi-a' });
    query(() => Promise.resolve('b'), { key: 'ssr-multi-b', ssrTimeout: 200 });
    query(() => Promise.resolve('c'), { key: 'ssr-multi-c', ssrTimeout: 50 });

    expect(ctx.queries).toHaveLength(3);
    expect(ctx.queries[0]?.timeout).toBe(300);
    expect(ctx.queries[1]?.timeout).toBe(200);
    expect(ctx.queries[2]?.timeout).toBe(50);
  });

  it('does not register when initialData is provided', () => {
    const result = query(() => Promise.resolve('fetched'), {
      key: 'ssr-initial-data',
      initialData: 'cached',
    });

    // initialData already provides the data — no need to SSR-fetch
    expect(ctx.queries).toHaveLength(0);
    expect(result.data.value).toBe('cached');
  });

  it('promise from thunk is the registered promise', async () => {
    const expected = Promise.resolve('test-data');
    query(() => expected, { key: 'ssr-promise-test' });

    expect(ctx.queries).toHaveLength(1);
    await expect(ctx.queries[0]?.promise).resolves.toBe('test-data');
  });

  it('error in thunk does not crash — promise rejects but is registered', () => {
    const rejectedPromise = Promise.reject(new Error('fetch-error'));
    // Suppress unhandled rejection
    rejectedPromise.catch(() => {});

    query(() => rejectedPromise, { key: 'ssr-error-test' });

    expect(ctx.queries).toHaveLength(1);
  });

  it('registered entry includes the query cache key for streaming', () => {
    query(() => Promise.resolve('data'), { key: 'streaming-key-test' });

    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.key).toBe('streaming-key-test');
  });

  it('uses global ssrTimeout default when set on context and no per-query override', () => {
    ctx.globalSSRTimeout = 250;
    query(() => Promise.resolve('data'), { key: 'global-timeout-test' });
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.timeout).toBe(250);
  });

  it('falls back to 300 when global ssrTimeout is not set', () => {
    // Ensure no global is set
    ctx.globalSSRTimeout = undefined;
    query(() => Promise.resolve('data'), { key: 'fallback-timeout-test' });
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.timeout).toBe(300);
  });

  it('per-query ssrTimeout overrides global default', () => {
    ctx.globalSSRTimeout = 250;
    query(() => Promise.resolve('data'), { key: 'override-timeout-test', ssrTimeout: 500 });
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.timeout).toBe(500);
  });

  it('decomposes descriptor-in-thunk during SSR and registers promise', () => {
    const descriptor = createDescriptor(
      'GET',
      '/tasks',
      () => Promise.resolve({ ok: true as const, data: { data: ['task-1'] } }),
      undefined,
      { entityType: 'tasks', kind: 'list' },
    );

    const result = query(() => descriptor, { ssrTimeout: 100 });

    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]?.timeout).toBe(100);
    // idle starts true — no data yet
    expect(result.idle.value).toBe(true);
  });

  it('descriptor-in-thunk SSR resolve callback sets idle=false and populates data', () => {
    const descriptor = createDescriptor(
      'GET',
      '/tasks',
      () => Promise.resolve({ ok: true as const, data: { data: ['resolved-task'] } }),
      undefined,
      { entityType: 'tasks', kind: 'list' },
    );

    const result = query(() => descriptor);

    expect(ctx.queries).toHaveLength(1);

    // Simulate renderToHTML resolving the SSR promise
    ctx.queries[0]?.resolve(['resolved-task']);

    expect(result.data.value).toEqual(['resolved-task']);
    expect(result.loading.value).toBe(false);
    expect(result.idle.value).toBe(false);
  });

  it('SSR cache hit (pass 2) serves data immediately and sets idle=false', () => {
    const cache = new MemoryCache<string[]>();
    const cacheKey = 'ssr-cache-hit-test';

    // Simulate pass 1 already resolved — cache is pre-populated
    cache.set(cacheKey, ['cached-task']);

    const descriptor = createDescriptor(
      'GET',
      '/tasks',
      () => Promise.resolve({ ok: true as const, data: { data: ['fresh'] } }),
      undefined,
      { entityType: 'tasks', kind: 'list' },
    );

    const result = query(() => descriptor, { cache, key: cacheKey });

    // Pass 2: data served from cache, no SSR promise registered
    expect(ctx.queries).toHaveLength(0);
    expect(result.data.value).toEqual(['cached-task']);
    expect(result.loading.value).toBe(false);
    expect(result.idle.value).toBe(false);
  });
});

describe('query() client-side SSR hydration', () => {
  // Minimal event listener mock
  const listeners = new Map<string, Set<EventListener>>();
  const origDocument = globalThis.document;

  beforeEach(() => {
    listeners.clear();
    // NOT in SSR mode (client-side) — no resolver set
    disableTestSSR();
    // Mock document for event listeners
    (globalThis as Record<string, unknown>).document = {
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent: (event: { type: string; detail: unknown }) => {
        const fns = listeners.get(event.type);
        if (fns) {
          for (const fn of fns) fn(event as unknown as Event);
        }
      },
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
    (globalThis as Record<string, unknown>).document = origDocument;
  });

  it('picks up pre-existing SSR data without fetching', async () => {
    const fetchFn = vi.fn(() => Promise.resolve('fetched-from-server'));

    // Simulate SSR data already buffered
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: 'hydrate-test', data: 'ssr-streamed-data' },
    ];

    const result = query<string>(fetchFn, { key: 'hydrate-test' });

    // Wait a tick for any async effects to settle
    await new Promise((r) => setTimeout(r, 10));

    // Data should come from SSR, not from the fetch.
    // This test uses customKey — the SSR hydration path skips the thunk
    // call entirely (no deps to track when key is static).
    expect(result.data.value).toBe('ssr-streamed-data');
    expect(result.loading.value).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('query without SSR data falls back to normal fetch', async () => {
    // No __VERTZ_SSR_DATA__ — not an SSR-rendered page
    const result = query<string>(() => Promise.resolve('client-fetched'), {
      key: 'no-ssr-data',
    });

    // Wait for the fetch to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(result.data.value).toBe('client-fetched');
  });

  // Helper: compute the SSR key the same way query.ts does during SSR.
  // During SSR, callThunkWithCapture() runs WITHOUT a subscriber, so the
  // readValueCallback never fires and captured=[] → depHash=hashString("").
  // The SSR key format is: `${baseKey}:${hashString("")}`.
  function computeSSRKey(thunk: () => unknown): string {
    const baseKey = `__q:${hashString(thunk.toString())}`;
    // No subscriber → empty capture → dep hash from empty string
    const depHash = hashString('');
    return `${baseKey}:${depHash}`;
  }

  it('preserves SSR data during hydration for derived-key query (#1859)', async () => {
    const page = signal(1);
    const fetchFn = vi.fn(async () => ({ items: ['fetched'], total: 10 }));

    const thunk = () => {
      const currentPage = page.value;
      return fetchFn(currentPage) as Promise<{ items: string[]; total: number }>;
    };

    // SSR stores data with the dep-hash key format.
    const ssrKey = computeSSRKey(thunk);

    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: ssrKey, data: { items: ['ssr-item'], total: 10 } },
    ];

    const result = query(thunk);

    await new Promise((r) => setTimeout(r, 10));

    // SSR data must be preserved — no loading flash (#1859)
    expect(result.data.value).toEqual({ items: ['ssr-item'], total: 10 });
    expect(result.loading.value).toBe(false);

    result.dispose();
  });

  it('preserves SSR data for descriptor-in-thunk during hydration (#1859)', async () => {
    const page = signal(1);
    const fetchFn = vi.fn().mockImplementation(async () => ({
      ok: true as const,
      data: { items: ['fetched'], total: 10 },
    }));

    const thunk = () => {
      const currentPage = page.value;
      const offset = (currentPage - 1) * 20;
      return {
        _tag: 'QueryDescriptor' as const,
        _key: `GET:/brands?offset=${offset}`,
        _fetch: () => fetchFn(offset),
        // eslint-disable-next-line unicorn/no-thenable -- intentional PromiseLike mock
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };
    };

    const ssrKey = computeSSRKey(thunk);

    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: ssrKey, data: { items: ['ssr-brand'], total: 10 } },
    ];

    const result = query(thunk);

    await new Promise((r) => setTimeout(r, 10));

    // SSR data preserved — no fetch triggered during hydration
    expect(result.data.value).toEqual({ items: ['ssr-brand'], total: 10 });
    expect(result.loading.value).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();

    result.dispose();
  });

  it('re-fetches when reactive deps change after SSR hydration (#1861)', async () => {
    const page = signal(1);

    const fetchFn = vi.fn(async (offset: number) => {
      return { items: [`item-at-${offset}`], total: 100 };
    });

    const thunk = () => {
      const currentPage = page.value;
      const offset = (currentPage - 1) * 20;
      return fetchFn(offset) as Promise<{ items: string[]; total: number }>;
    };

    const ssrKey = computeSSRKey(thunk);

    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: ssrKey, data: { items: ['ssr-brand'], total: 100 } },
    ];

    const result = query(thunk);

    await new Promise((r) => setTimeout(r, 10));

    // SSR data hydrated
    expect(result.data.value).toEqual({ items: ['ssr-brand'], total: 100 });

    // Reset mock to track only the re-fetch from dep change
    fetchFn.mockClear();

    // Change reactive dep — should trigger re-fetch
    page.value = 2;

    await new Promise((r) => setTimeout(r, 10));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(20);
    expect(result.data.value).toEqual({ items: ['item-at-20'], total: 100 });

    result.dispose();
  });

  it('re-fetches descriptor-in-thunk when reactive deps change after SSR hydration (#1861)', async () => {
    const page = signal(1);

    const fetchFn = vi.fn().mockImplementation(async (offset: number) => ({
      ok: true as const,
      data: { items: [`brand-at-${offset}`], total: 50 },
    }));

    const thunk = () => {
      const currentPage = page.value;
      const offset = (currentPage - 1) * 20;
      return {
        _tag: 'QueryDescriptor' as const,
        _key: `GET:/brands?offset=${offset}`,
        _fetch: () => fetchFn(offset),
        // eslint-disable-next-line unicorn/no-thenable -- intentional PromiseLike mock
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };
    };

    const ssrKey = computeSSRKey(thunk);

    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: ssrKey, data: { items: ['ssr-brand'], total: 50 } },
    ];

    const result = query(thunk);

    await new Promise((r) => setTimeout(r, 10));

    // SSR data hydrated — no fetch
    expect(result.data.value).toEqual({ items: ['ssr-brand'], total: 50 });
    expect(fetchFn).not.toHaveBeenCalled();

    // Change reactive dep — should trigger re-fetch
    page.value = 2;

    await new Promise((r) => setTimeout(r, 10));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.data.value).toEqual({ items: ['brand-at-20'], total: 50 });

    result.dispose();
  });

  it('full lifecycle: SSR hydrate → preserve data → dep change → re-fetch (#1859 + #1861)', async () => {
    const page = signal(1);

    const fetchFn = vi.fn(async (offset: number) => ({
      items: [`item-at-${offset}`],
      total: 100,
    }));

    const thunk = () => {
      const currentPage = page.value;
      const offset = (currentPage - 1) * 20;
      return fetchFn(offset) as Promise<{ items: string[]; total: number }>;
    };

    const ssrKey = computeSSRKey(thunk);

    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: ssrKey, data: { items: ['ssr-brand'], total: 100 } },
    ];

    const result = query(thunk);

    await new Promise((r) => setTimeout(r, 10));

    // Phase 1: SSR data preserved (no flash)
    expect(result.data.value).toEqual({ items: ['ssr-brand'], total: 100 });
    expect(result.loading.value).toBe(false);

    fetchFn.mockClear();

    // Phase 2: Change dep → re-fetch
    page.value = 2;
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(20);
    expect(result.data.value).toEqual({ items: ['item-at-20'], total: 100 });

    fetchFn.mockClear();

    // Phase 3: Change dep again → re-fetch again
    page.value = 3;
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(40);
    expect(result.data.value).toEqual({ items: ['item-at-40'], total: 100 });

    result.dispose();
  });

  it('null-returning thunk during hydration falls through to normal effect path', async () => {
    let ready = false;
    const fetchFn = vi.fn(async () => 'data');
    const thunk = () => (ready ? fetchFn() : null) as Promise<string> | null;

    const ssrKey = computeSSRKey(thunk);

    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: ssrKey, data: 'ssr-data-for-null-thunk' },
    ];

    const result = query(thunk);

    await new Promise((r) => setTimeout(r, 10));

    // Thunk returns null during init probe — SSR data key computed but the
    // thunk's null causes the effect to skip on first run too.
    // loading should be false because SSR hydration resolved.
    expect(result.loading.value).toBe(false);

    // Make thunk ready and trigger a re-fetch
    ready = true;
    result.refetch();
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.data.value).toBe('data');

    result.dispose();
  });
});

// ─── Nav prefetch integration ─────────────────────────────────

describe('query() nav prefetch integration', () => {
  beforeEach(() => {
    // Ensure we're NOT in SSR mode (client-side)
    disableTestSSR();
    // Clean up nav prefetch state
    delete (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;
  });

  it('defers client fetch when nav prefetch is active', async () => {
    // Set up SSR data bus (as prefetchNavData would)
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    const fetchFn = vi.fn(() => Promise.resolve('fetched'));
    const result = query(fetchFn, { key: 'nav-defer-test' });

    // Wait for potential async operations
    await new Promise((r) => setTimeout(r, 50));

    // Thunk should NOT have been called — query is deferring
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.loading.value).toBe(true);

    result.dispose();
  });

  it('receives data from buffer when data arrives before mount', () => {
    // Data already in buffer when query mounts
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [
      { key: 'nav-buf-test', data: 'prefetched' },
    ];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    const fetchFn = vi.fn(() => Promise.resolve('fetched'));
    const result = query(fetchFn, { key: 'nav-buf-test' });

    expect(result.data.value).toBe('prefetched');
    expect(result.loading.value).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();

    result.dispose();
  });

  it('receives data via vertz:ssr-data event during nav prefetch', async () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    const fetchFn = vi.fn(() => Promise.resolve('fetched'));
    const result = query(fetchFn, { key: 'nav-event-test' });

    // Data arrives via SSE after query mounted
    document.dispatchEvent(
      new CustomEvent('vertz:ssr-data', {
        detail: { key: 'nav-event-test', data: 'streamed' },
      }),
    );

    expect(result.data.value).toBe('streamed');
    expect(result.loading.value).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();

    result.dispose();
  });

  it('serves cached data for derived-key query during navigation', async () => {
    // Pre-populate cache with data from a previous visit
    const cache = new MemoryCache<string>();
    const dep = signal('value-1');

    // Shared thunk — must be the same function reference so deriveKey
    // produces the same base key for both query instances.
    const fetchFn = () => {
      dep.value;
      return Promise.resolve('fresh-data');
    };

    // First visit: NOT a navigation — populate the cache normally
    delete (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;

    const result = query(fetchFn, { cache });

    // Wait for the effect to complete and cache to populate
    await new Promise((r) => setTimeout(r, 50));
    expect(result.data.value).toBe('fresh-data');
    result.dispose();

    // Second visit: simulate navigation context with same dep values
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    const result2 = query(fetchFn, { cache });

    // Wait for the effect to run
    await new Promise((r) => setTimeout(r, 50));

    // With Phase 4 fix: derived-key queries check cache during navigation
    // The data should be served from cache (no loading flash)
    expect(result2.data.value).toBe('fresh-data');
    expect(result2.loading.value).toBe(false);

    result2.dispose();
  });

  it('serves cached data for descriptor-in-thunk query during navigation', async () => {
    // Pre-populate cache by running a descriptor-in-thunk query on first visit
    const cache = new MemoryCache<unknown>();
    const dep = signal(1);

    const fetchFn = vi.fn(async (page: number) => ({
      ok: true as const,
      data: { items: [`page-${page}`], total: 10 },
    }));

    // Shared thunk — same function reference produces same base key
    const thunk = () => {
      const currentPage = dep.value;
      return {
        _tag: 'QueryDescriptor' as const,
        _key: `GET:/tasks?page=${currentPage}`,
        _fetch: () => fetchFn(currentPage),
        // eslint-disable-next-line unicorn/no-thenable -- intentional PromiseLike mock
        then(onFulfilled: any, onRejected: any) {
          return this._fetch().then(onFulfilled, onRejected);
        },
      };
    };

    // First visit: NOT a navigation — populate the cache normally
    delete (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__;

    const result = query(thunk, { cache });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.data.value).toEqual({ items: ['page-1'], total: 10 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    result.dispose();

    // Second visit: simulate navigation context
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    fetchFn.mockClear();

    const result2 = query(thunk, { cache });

    await new Promise((r) => setTimeout(r, 50));

    // Descriptor-in-thunk queries cache under effectKey:depHash.
    // Nav-prefetch must use the same key format to find cached data.
    expect(result2.data.value).toEqual({ items: ['page-1'], total: 10 });
    expect(result2.loading.value).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();

    result2.dispose();
  });

  it('late prefetch done does not double-fetch when SSR data arrived via stream', async () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    let fetchCount = 0;
    const fetchFn = vi.fn(() => {
      fetchCount++;
      return Promise.resolve(`data-${fetchCount}`);
    });
    const result = query(fetchFn, { key: 'late-done-ssr-test' });

    // Data arrives via SSR stream
    document.dispatchEvent(
      new CustomEvent('vertz:ssr-data', {
        detail: { key: 'late-done-ssr-test', data: 'ssr-data' },
      }),
    );

    // SSR hydration set the data
    expect(result.data.value).toBe('ssr-data');

    // Now the doneHandler fires (late prefetch completion)
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = false;
    document.dispatchEvent(new CustomEvent('vertz:nav-prefetch-done'));

    // Wait to ensure no redundant fetch was triggered
    await new Promise((r) => setTimeout(r, 100));

    // Should NOT have fetched — data already arrived via SSR stream
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.data.value).toBe('ssr-data');

    result.dispose();
  });

  it('falls back to client fetch after prefetch done with no data', async () => {
    (globalThis as Record<string, unknown>).__VERTZ_SSR_DATA__ = [];
    (globalThis as Record<string, unknown>).__VERTZ_SSR_PUSH__ = () => {};
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = true;

    const fetchFn = vi.fn(() => Promise.resolve('client-data'));
    const result = query(fetchFn, { key: 'nav-fallback-test' });

    // Simulate prefetch completing without data for this key
    (globalThis as Record<string, unknown>).__VERTZ_NAV_PREFETCH_ACTIVE__ = false;
    document.dispatchEvent(new CustomEvent('vertz:nav-prefetch-done'));

    // Wait for the fallback client fetch
    await new Promise((r) => setTimeout(r, 100));

    expect(fetchFn).toHaveBeenCalled();
    expect(result.data.value).toBe('client-data');

    result.dispose();
  });
});
