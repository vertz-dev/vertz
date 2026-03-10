/**
 * SSR test helpers for @vertz/ui tests.
 * Allows tests to simulate SSR context without depending on @vertz/ui-server.
 * @internal — test utility only, not part of the public API.
 */
import { createDOMAdapter } from '../dom/dom-adapter';
import { MemoryCache } from '../query/cache';
import type { SSRRenderContext } from './ssr-render-context';
import { registerSSRResolver } from './ssr-render-context';

/**
 * Create a minimal mock SSRRenderContext for testing.
 * Uses real DOMAdapter and MemoryCache; entity/envelope stores are stubs
 * (sufficient for SSR detection and query registration tests).
 */
export function createTestSSRContext(url = '/'): SSRRenderContext {
  return {
    url,
    adapter: createDOMAdapter(),
    subscriber: null,
    readValueCb: null,
    cleanupStack: [],
    batchDepth: 0,
    pendingEffects: new Map(),
    contextScope: null,
    entityStore: {} as SSRRenderContext['entityStore'],
    envelopeStore: {} as SSRRenderContext['envelopeStore'],
    queryCache: new MemoryCache<unknown>({ maxSize: Infinity }),
    inflight: new Map(),
    queries: [],
    errors: [],
  };
}

/**
 * Enable mock SSR context for tests. Returns the context object
 * so tests can inspect queries, errors, etc.
 */
export function enableTestSSR(ctx?: SSRRenderContext): SSRRenderContext {
  const c = ctx ?? createTestSSRContext();
  registerSSRResolver(() => c);
  return c;
}

/**
 * Disable mock SSR context (cleanup for afterEach).
 */
export function disableTestSSR(): void {
  registerSSRResolver(null);
}
