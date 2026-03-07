export interface SSRRenderContext {
  url: string;
  adapter: import('../dom/adapter').RenderAdapter;
}

type SSRContextResolver = () => SSRRenderContext | undefined;

let _ssrResolver: SSRContextResolver | null = null;

export function registerSSRResolver(resolver: SSRContextResolver): void {
  _ssrResolver = resolver;
}

export function getSSRContext(): SSRRenderContext | undefined {
  return _ssrResolver?.();
}
