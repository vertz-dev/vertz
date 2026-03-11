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
}

type SSRContextResolver = () => SSRRenderContext | undefined;

let _ssrResolver: SSRContextResolver | null = null;

export function registerSSRResolver(resolver: SSRContextResolver | null): void {
  _ssrResolver = resolver;
}

export function getSSRContext(): SSRRenderContext | undefined {
  return _ssrResolver?.();
}
