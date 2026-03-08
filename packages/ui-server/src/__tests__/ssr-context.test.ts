import { describe, expect, it } from 'bun:test';
import type { SSRRenderContext } from '@vertz/ui/internals';
import {
  clearGlobalSSRTimeout,
  collectSSRError,
  getGlobalSSRTimeout,
  getSSRErrors,
  getSSRQueries,
  registerSSRQuery,
  setGlobalSSRTimeout,
  ssrStorage,
} from '../ssr-context';

/** Create a minimal SSRRenderContext for testing. Only url/errors/queries are populated. */
function testCtx(overrides: Partial<SSRRenderContext> & { url: string }): SSRRenderContext {
  return {
    url: overrides.url,
    adapter: {} as SSRRenderContext['adapter'],
    subscriber: null,
    readValueCb: null,
    cleanupStack: [],
    batchDepth: 0,
    pendingEffects: new Map(),
    contextScope: null,
    entityStore: {} as SSRRenderContext['entityStore'],
    envelopeStore: {} as SSRRenderContext['envelopeStore'],
    queryCache: {} as SSRRenderContext['queryCache'],
    inflight: new Map(),
    queries: [],
    errors: [],
    ...overrides,
  };
}

describe('SSR error collection', () => {
  it('SSRContext.errors is initialized as empty array', () => {
    ssrStorage.run(testCtx({ url: '/test' }), () => {
      const errors = getSSRErrors();
      expect(errors).toEqual([]);
    });
  });

  it('collectSSRError adds errors to the context', () => {
    ssrStorage.run(testCtx({ url: '/test' }), () => {
      const err = new Error('domEffect failed');
      collectSSRError(err);
      const errors = getSSRErrors();
      expect(errors).toEqual([err]);
    });
  });

  it('collectSSRError accumulates multiple errors', () => {
    ssrStorage.run(testCtx({ url: '/test' }), () => {
      collectSSRError(new Error('first'));
      collectSSRError(new Error('second'));
      collectSSRError('string error');
      const errors = getSSRErrors();
      expect(errors).toHaveLength(3);
      expect((errors[0] as Error).message).toBe('first');
      expect((errors[1] as Error).message).toBe('second');
      expect(errors[2]).toBe('string error');
    });
  });

  it('collectSSRError is a no-op outside SSR context', () => {
    // Should not throw when called outside SSR
    expect(() => collectSSRError(new Error('no context'))).not.toThrow();
  });

  it('getSSRErrors returns empty array outside SSR context', () => {
    expect(getSSRErrors()).toEqual([]);
  });
});

describe('SSR query registration', () => {
  it('registerSSRQuery adds entry to context queries array', () => {
    ssrStorage.run(testCtx({ url: '/test' }), () => {
      const entry = {
        promise: Promise.resolve('data'),
        timeout: 100,
        resolve: () => {},
        key: 'test-key',
      };
      registerSSRQuery(entry);
      const queries = getSSRQueries();
      expect(queries).toHaveLength(1);
      expect(queries[0]).toBe(entry);
    });
  });

  it('registered entry preserves key for streaming identification', () => {
    ssrStorage.run(testCtx({ url: '/test' }), () => {
      registerSSRQuery({
        promise: Promise.resolve('data'),
        timeout: 100,
        resolve: () => {},
        key: 'my-query-key',
      });
      const queries = getSSRQueries();
      expect(queries[0]?.key).toBe('my-query-key');
    });
  });

  it('registerSSRQuery accumulates multiple entries', () => {
    ssrStorage.run(testCtx({ url: '/test' }), () => {
      registerSSRQuery({ promise: Promise.resolve(1), timeout: 50, resolve: () => {}, key: 'q1' });
      registerSSRQuery({ promise: Promise.resolve(2), timeout: 100, resolve: () => {}, key: 'q2' });
      registerSSRQuery({ promise: Promise.resolve(3), timeout: 200, resolve: () => {}, key: 'q3' });
      expect(getSSRQueries()).toHaveLength(3);
    });
  });

  it('registerSSRQuery is a no-op outside SSR context', () => {
    expect(() =>
      registerSSRQuery({
        promise: Promise.resolve(),
        timeout: 100,
        resolve: () => {},
        key: 'noop',
      }),
    ).not.toThrow();
  });

  it('getSSRQueries returns empty array outside SSR context', () => {
    expect(getSSRQueries()).toEqual([]);
  });
});

describe('global ssrTimeout — per-request isolation', () => {
  it('ssrTimeout is scoped to the current SSR context, not globalThis', async () => {
    // Simulate two concurrent requests with different ssrTimeouts
    const results: (number | undefined)[] = [];

    const request1 = ssrStorage.run(testCtx({ url: '/r1' }), async () => {
      setGlobalSSRTimeout(500);
      // Yield to let request2 run
      await new Promise((r) => setTimeout(r, 10));
      // Read the timeout — should still be 500, not clobbered by request2
      results.push(getGlobalSSRTimeout());
      clearGlobalSSRTimeout();
    });

    const request2 = ssrStorage.run(testCtx({ url: '/r2' }), async () => {
      setGlobalSSRTimeout(50);
      await new Promise((r) => setTimeout(r, 5));
      results.push(getGlobalSSRTimeout());
      clearGlobalSSRTimeout();
    });

    await Promise.all([request1, request2]);

    // Each request should see its own timeout, not the other's
    expect(results).toContain(500);
    expect(results).toContain(50);
  });
});
