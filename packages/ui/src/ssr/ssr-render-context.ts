export interface SSRRenderContext {
  url: string;
  adapter: import('../dom/adapter').RenderAdapter;
  subscriber: import('../runtime/signal-types').Subscriber | null;
  readValueCb: ((value: unknown) => void) | null;
  cleanupStack: import('../runtime/signal-types').DisposeFn[][];
  batchDepth: number;
  pendingEffects: Map<number, import('../runtime/signal-types').Subscriber>;
}

type SSRContextResolver = () => SSRRenderContext | undefined;

let _ssrResolver: SSRContextResolver | null = null;

export function registerSSRResolver(resolver: SSRContextResolver): void {
  _ssrResolver = resolver;
}

export function getSSRContext(): SSRRenderContext | undefined {
  return _ssrResolver?.();
}
