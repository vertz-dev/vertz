/** Entry registered by query() during SSR for renderToHTML() to await. */
export interface SSRQueryEntry {
  promise: Promise<unknown>;
  timeout: number;
  resolve: (data: unknown) => void;
  key: string;
  resolved?: boolean;
}

export interface SSRRenderContext {
  url: string;
  adapter: import('../dom/adapter').RenderAdapter;
  subscriber: import('../runtime/signal-types').Subscriber | null;
  readValueCb: ((value: unknown) => void) | null;
  cleanupStack: import('../runtime/signal-types').DisposeFn[][];
  batchDepth: number;
  pendingEffects: Map<number, import('../runtime/signal-types').Subscriber>;
  contextScope: import('../component/context').ContextScope | null;
  entityStore: import('../store/entity-store').EntityStore;
  envelopeStore: import('../store/query-envelope-store').QueryEnvelopeStore;
  queryCache: import('../query').MemoryCache<unknown>;
  inflight: Map<string, Promise<unknown>>;
  /** SSR queries registered for awaiting before final render. */
  queries: SSRQueryEntry[];
  /** Errors collected during SSR rendering. */
  errors: unknown[];
  /** Global per-query timeout override (ms). */
  globalSSRTimeout?: number;
  /**
   * Lazy route component Promises registered by RouterView during Pass 1.
   * Keyed by CompiledRoute object identity to avoid pattern string collisions.
   */
  pendingRouteComponents?: Map<object, Promise<{ default: () => Node }>>;
  /**
   * Resolved sync factories, populated between Pass 1 and Pass 2.
   * Keyed by CompiledRoute object identity.
   */
  resolvedComponents?: Map<object, () => Node>;
  /**
   * Route patterns discovered by createRouter() during SSR.
   * Used by the build pipeline to discover which routes to pre-render.
   */
  discoveredRoutes?: string[];

  /**
   * Route patterns that matched the current URL during SSR.
   * The full matched chain from root to leaf (e.g., ['/app', '/app/settings']).
   * Used by the SSR handler to inject per-route modulepreload tags.
   */
  matchedRoutePatterns?: string[];

  /**
   * Auth state resolved by the server (e.g. from session cookie).
   * Set by ssrRenderToString() before Pass 1 so AuthProvider can
   * hydrate status/user synchronously during SSR.
   */
  ssrAuth?: SSRAuth;

  /**
   * Written by ProtectedRoute during Pass 1 when the user is not
   * authenticated. Signals ssrRenderToString() to skip Pass 2 and
   * return a redirect response instead.
   */
  ssrRedirect?: { to: string };

  /**
   * Per-request CSS tracker for render-scoped collection.
   * Populated by injectCSS() during SSR render. collectCSS() reads
   * from this Set instead of the global injectedCSS to ensure each
   * response only includes CSS for components actually rendered.
   */
  cssTracker?: Set<string>;

  /**
   * Request cookies (from the `Cookie` header).
   * Set by the SSR handler before rendering so that `document.cookie`
   * reads the real request cookies during SSR — same as in a browser.
   */
  cookies?: string;
}

/** Auth state injected into SSRRenderContext by the server. */
export type SSRAuth = (
  | {
      status: 'authenticated';
      user: { id: string; email: string; role: string; [key: string]: unknown };
      expiresAt: number;
    }
  | { status: 'unauthenticated' }
) & {
  /** OAuth provider metadata for SSR rendering of login buttons. */
  providers?: { id: string; name: string; authUrl: string }[];
};

type SSRContextResolver = () => SSRRenderContext | undefined;

/**
 * Key for the SSR resolver on globalThis.
 * Lives on globalThis so it survives require.cache clears during HMR.
 * When the dev server clears the entire require.cache and re-imports
 * SSR modules, module-level variables reset to their initial values.
 * globalThis persists across module re-evaluations, so the resolver
 * registered by @vertz/ui-server at import time remains available.
 *
 * Same pattern as __VERTZ_CTX_REG__ in component/context.ts.
 */
const RESOLVER_KEY = '__VERTZ_SSR_RESOLVER__';

function getResolver(): SSRContextResolver | null {
  return (
    ((globalThis as Record<string, unknown>)[RESOLVER_KEY] as SSRContextResolver | null) ?? null
  );
}

export function registerSSRResolver(resolver: SSRContextResolver | null): void {
  if (resolver === null) {
    delete (globalThis as Record<string, unknown>)[RESOLVER_KEY];
  } else {
    (globalThis as Record<string, unknown>)[RESOLVER_KEY] = resolver;
  }
}

export function getSSRContext(): SSRRenderContext | undefined {
  return getResolver()?.();
}

/**
 * Returns true when an SSR resolver has been registered.
 *
 * This indicates we are running on the server — regardless of whether
 * an SSR render is currently active. The resolver is registered once
 * at import time by `@vertz/ui-server` and never cleared during the
 * server's lifetime. Stored on globalThis so it survives require.cache
 * clears during HMR module re-evaluation.
 */
export function hasSSRResolver(): boolean {
  return getResolver() !== null;
}
