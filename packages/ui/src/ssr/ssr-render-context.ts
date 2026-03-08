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
}

type SSRContextResolver = () => SSRRenderContext | undefined;

let _ssrResolver: SSRContextResolver | null = null;

export function registerSSRResolver(resolver: SSRContextResolver): void {
  _ssrResolver = resolver;
}

export function getSSRContext(): SSRRenderContext | undefined {
  return _ssrResolver?.();
}
