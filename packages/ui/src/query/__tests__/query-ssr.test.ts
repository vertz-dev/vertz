import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../query';

describe('query() SSR behavior', () => {
  const registeredQueries: Array<{
    promise: Promise<unknown>;
    timeout: number;
    resolve: (data: unknown) => void;
    key?: string;
  }> = [];

  beforeEach(() => {
    registeredQueries.length = 0;
    (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__ = () => true;
    (globalThis as Record<string, unknown>).__VERTZ_SSR_REGISTER_QUERY__ = (
      entry: (typeof registeredQueries)[number],
    ) => {
      registeredQueries.push(entry);
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__;
    delete (globalThis as Record<string, unknown>).__VERTZ_SSR_REGISTER_QUERY__;
  });

  it('registers a query promise with SSR context during SSR', () => {
    query(() => Promise.resolve('data'), { key: 'ssr-test' });

    expect(registeredQueries).toHaveLength(1);
    expect(registeredQueries[0]?.timeout).toBe(300); // default timeout matches plugin default
    expect(registeredQueries[0]?.promise).toBeInstanceOf(Promise);
  });

  it('uses custom ssrTimeout when provided', () => {
    query(() => Promise.resolve('data'), { key: 'ssr-timeout-test', ssrTimeout: 50 });

    expect(registeredQueries).toHaveLength(1);
    expect(registeredQueries[0]?.timeout).toBe(50);
  });

  it('does not register when ssrTimeout is 0', () => {
    query(() => Promise.resolve('data'), { key: 'ssr-disabled-test', ssrTimeout: 0 });

    expect(registeredQueries).toHaveLength(0);
  });

  it('resolve callback updates data and loading signals', async () => {
    const result = query<string>(() => Promise.resolve('server-data'), {
      key: 'ssr-resolve-test',
    });

    expect(registeredQueries).toHaveLength(1);

    // Simulate what renderToHTML does: await the promise, then call resolve
    registeredQueries[0]?.resolve('server-data');

    expect(result.data.value).toBe('server-data');
    expect(result.loading.value).toBe(false);
  });

  it('does not register when enabled is false', () => {
    query(() => Promise.resolve('data'), {
      key: 'ssr-disabled-query',
      enabled: false,
    });

    expect(registeredQueries).toHaveLength(0);
  });

  it('multiple queries register independently in parallel', () => {
    query(() => Promise.resolve('a'), { key: 'ssr-multi-a' });
    query(() => Promise.resolve('b'), { key: 'ssr-multi-b', ssrTimeout: 200 });
    query(() => Promise.resolve('c'), { key: 'ssr-multi-c', ssrTimeout: 50 });

    expect(registeredQueries).toHaveLength(3);
    expect(registeredQueries[0]?.timeout).toBe(300);
    expect(registeredQueries[1]?.timeout).toBe(200);
    expect(registeredQueries[2]?.timeout).toBe(50);
  });

  it('does not register when initialData is provided', () => {
    const result = query(() => Promise.resolve('fetched'), {
      key: 'ssr-initial-data',
      initialData: 'cached',
    });

    // initialData already provides the data — no need to SSR-fetch
    expect(registeredQueries).toHaveLength(0);
    expect(result.data.value).toBe('cached');
  });

  it('promise from thunk is the registered promise', async () => {
    const expected = Promise.resolve('test-data');
    query(() => expected, { key: 'ssr-promise-test' });

    expect(registeredQueries).toHaveLength(1);
    await expect(registeredQueries[0]?.promise).resolves.toBe('test-data');
  });

  it('error in thunk does not crash — promise rejects but is registered', () => {
    const rejectedPromise = Promise.reject(new Error('fetch-error'));
    // Suppress unhandled rejection
    rejectedPromise.catch(() => {});

    query(() => rejectedPromise, { key: 'ssr-error-test' });

    expect(registeredQueries).toHaveLength(1);
  });

  it('registered entry includes the query cache key for streaming', () => {
    query(() => Promise.resolve('data'), { key: 'streaming-key-test' });

    expect(registeredQueries).toHaveLength(1);
    expect(registeredQueries[0]?.key).toBe('streaming-key-test');
  });

  it('uses global ssrTimeout default when set via function hook and no per-query override', () => {
    (globalThis as Record<string, unknown>).__VERTZ_GET_GLOBAL_SSR_TIMEOUT__ = () => 250;
    try {
      query(() => Promise.resolve('data'), { key: 'global-timeout-test' });
      expect(registeredQueries).toHaveLength(1);
      expect(registeredQueries[0]?.timeout).toBe(250);
    } finally {
      delete (globalThis as Record<string, unknown>).__VERTZ_GET_GLOBAL_SSR_TIMEOUT__;
    }
  });

  it('falls back to 300 when global ssrTimeout hook is not set', () => {
    // Ensure no global is set
    delete (globalThis as Record<string, unknown>).__VERTZ_GET_GLOBAL_SSR_TIMEOUT__;
    query(() => Promise.resolve('data'), { key: 'fallback-timeout-test' });
    expect(registeredQueries).toHaveLength(1);
    expect(registeredQueries[0]?.timeout).toBe(300);
  });

  it('per-query ssrTimeout overrides global default', () => {
    (globalThis as Record<string, unknown>).__VERTZ_GET_GLOBAL_SSR_TIMEOUT__ = () => 250;
    try {
      query(() => Promise.resolve('data'), { key: 'override-timeout-test', ssrTimeout: 500 });
      expect(registeredQueries).toHaveLength(1);
      expect(registeredQueries[0]?.timeout).toBe(500);
    } finally {
      delete (globalThis as Record<string, unknown>).__VERTZ_GET_GLOBAL_SSR_TIMEOUT__;
    }
  });
});

describe('query() client-side SSR hydration', () => {
  // Minimal event listener mock
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    listeners.clear();
    // NOT in SSR mode (client-side)
    delete (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__;
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
    delete (globalThis as Record<string, unknown>).document;
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

    // Data should come from SSR, not from the fetch
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
});
