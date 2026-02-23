import { describe, expect, it } from 'vitest';
import { collectSSRError, getSSRErrors, ssrStorage } from '../ssr-context';

describe('SSR error collection', () => {
  it('SSRContext.errors is initialized as empty array', () => {
    ssrStorage.run({ url: '/test', errors: [] }, () => {
      const errors = getSSRErrors();
      expect(errors).toEqual([]);
    });
  });

  it('collectSSRError adds errors to the context', () => {
    ssrStorage.run({ url: '/test', errors: [] }, () => {
      const err = new Error('domEffect failed');
      collectSSRError(err);
      const errors = getSSRErrors();
      expect(errors).toEqual([err]);
    });
  });

  it('collectSSRError accumulates multiple errors', () => {
    ssrStorage.run({ url: '/test', errors: [] }, () => {
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
