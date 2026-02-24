import { describe, expect, it } from 'vitest';
import {
  collectSSRError,
  getSSRErrors,
  getSSRQueries,
  registerSSRQuery,
  ssrStorage,
} from '../ssr-context';

describe('SSR error collection', () => {
  it('SSRContext.errors is initialized as empty array', () => {
    ssrStorage.run({ url: '/test', errors: [], queries: [] }, () => {
      const errors = getSSRErrors();
      expect(errors).toEqual([]);
    });
  });

  it('collectSSRError adds errors to the context', () => {
    ssrStorage.run({ url: '/test', errors: [], queries: [] }, () => {
      const err = new Error('domEffect failed');
      collectSSRError(err);
      const errors = getSSRErrors();
      expect(errors).toEqual([err]);
    });
  });

  it('collectSSRError accumulates multiple errors', () => {
    ssrStorage.run({ url: '/test', errors: [], queries: [] }, () => {
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
    ssrStorage.run({ url: '/test', errors: [], queries: [] }, () => {
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
    ssrStorage.run({ url: '/test', errors: [], queries: [] }, () => {
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
    ssrStorage.run({ url: '/test', errors: [], queries: [] }, () => {
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
