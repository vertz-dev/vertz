import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../query';

describe('query() SSR behavior', () => {
  const registeredQueries: Array<{
    promise: Promise<unknown>;
    timeout: number;
    resolve: (data: unknown) => void;
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
    expect(registeredQueries[0]?.timeout).toBe(100); // default timeout
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
    expect(registeredQueries[0]?.timeout).toBe(100);
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
});
