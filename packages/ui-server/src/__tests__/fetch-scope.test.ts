import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';
import { _resetFetchProxy, installFetchProxy, runWithScopedFetch } from '../fetch-scope';

describe('fetch-scope', () => {
  let realFetch: typeof fetch;

  beforeEach(() => {
    _resetFetchProxy();
    realFetch = globalThis.fetch;
  });

  afterEach(() => {
    _resetFetchProxy();
    // Ensure original is restored even if reset fails
    globalThis.fetch = realFetch;
  });

  describe('installFetchProxy', () => {
    it('replaces globalThis.fetch with a proxy', () => {
      installFetchProxy();
      expect(globalThis.fetch).not.toBe(realFetch);
    });

    it('is idempotent — second call is a no-op', () => {
      installFetchProxy();
      const proxy = globalThis.fetch;
      installFetchProxy();
      expect(globalThis.fetch).toBe(proxy);
    });
  });

  describe('proxy behavior outside runWithScopedFetch', () => {
    it('delegates to original fetch when no scope is active', async () => {
      const mockFetch = mock(() => Promise.resolve(new Response('original')));
      mockFetch.preconnect = realFetch.preconnect;
      globalThis.fetch = mockFetch as typeof fetch;

      installFetchProxy();

      const response = await globalThis.fetch('https://example.com');
      expect(await response.text()).toBe('original');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('runWithScopedFetch', () => {
    it('routes fetch through the scoped interceptor', async () => {
      const mockOriginal = mock(() => Promise.resolve(new Response('original')));
      mockOriginal.preconnect = realFetch.preconnect;
      globalThis.fetch = mockOriginal as typeof fetch;

      installFetchProxy();

      const interceptor = mock(() => Promise.resolve(new Response('intercepted')));
      interceptor.preconnect = realFetch.preconnect;

      const response = await runWithScopedFetch(interceptor as typeof fetch, () =>
        globalThis.fetch('https://example.com'),
      );

      expect(await response.text()).toBe('intercepted');
      expect(interceptor).toHaveBeenCalledTimes(1);
      expect(mockOriginal).not.toHaveBeenCalled();
    });

    it('restores original fetch after scope exits', async () => {
      const mockOriginal = mock(() => Promise.resolve(new Response('original')));
      mockOriginal.preconnect = realFetch.preconnect;
      globalThis.fetch = mockOriginal as typeof fetch;

      installFetchProxy();

      const interceptor = mock(() => Promise.resolve(new Response('intercepted')));
      interceptor.preconnect = realFetch.preconnect;

      runWithScopedFetch(interceptor as typeof fetch, () => {});

      // After scope exits, fetch should go to original
      await globalThis.fetch('https://example.com');
      expect(mockOriginal).toHaveBeenCalledTimes(1);
      expect(interceptor).not.toHaveBeenCalled();
    });

    it('isolates concurrent scoped requests', async () => {
      const mockOriginal = mock(() => Promise.resolve(new Response('original')));
      mockOriginal.preconnect = realFetch.preconnect;
      globalThis.fetch = mockOriginal as typeof fetch;

      installFetchProxy();

      const interceptorA = mock(() => Promise.resolve(new Response('A')));
      interceptorA.preconnect = realFetch.preconnect;
      const interceptorB = mock(() => Promise.resolve(new Response('B')));
      interceptorB.preconnect = realFetch.preconnect;

      // Run two scopes concurrently
      const [responseA, responseB] = await Promise.all([
        runWithScopedFetch(interceptorA as typeof fetch, async () => {
          // Small delay to interleave with B
          await new Promise((r) => setTimeout(r, 5));
          return globalThis.fetch('/api/a');
        }),
        runWithScopedFetch(interceptorB as typeof fetch, async () => {
          return globalThis.fetch('/api/b');
        }),
      ]);

      expect(await responseA.text()).toBe('A');
      expect(await responseB.text()).toBe('B');
      expect(interceptorA).toHaveBeenCalledTimes(1);
      expect(interceptorB).toHaveBeenCalledTimes(1);
      expect(mockOriginal).not.toHaveBeenCalled();
    });

    it('stress: 50 concurrent scopes each route to their own interceptor', async () => {
      const mockOriginal = mock(() => Promise.resolve(new Response('original')));
      mockOriginal.preconnect = realFetch.preconnect;
      globalThis.fetch = mockOriginal as typeof fetch;

      installFetchProxy();

      const count = 50;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => {
          const interceptor: typeof fetch = () => Promise.resolve(new Response(`scope-${i}`));
          interceptor.preconnect = realFetch.preconnect;
          return runWithScopedFetch(interceptor, async () => {
            // Introduce random delay to maximize interleaving
            await new Promise((r) => setTimeout(r, Math.random() * 10));
            return globalThis.fetch(`/api/test-${i}`);
          });
        }),
      );

      for (let i = 0; i < count; i++) {
        expect(await results[i].text()).toBe(`scope-${i}`);
      }
      expect(mockOriginal).not.toHaveBeenCalled();
    });
  });
});
