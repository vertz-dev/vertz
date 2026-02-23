import { AsyncLocalStorage } from 'node:async_hooks';

interface SSRContext {
  url: string;
}

export const ssrStorage = new AsyncLocalStorage<SSRContext>();

export function isInSSR(): boolean {
  return ssrStorage.getStore() !== undefined;
}

export function getSSRUrl(): string | undefined {
  return ssrStorage.getStore()?.url;
}

// Install global function hook so @vertz/ui can check SSR without importing ui-server
(globalThis as any).__VERTZ_IS_SSR__ = isInSSR;
