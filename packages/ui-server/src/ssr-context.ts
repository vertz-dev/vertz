import { AsyncLocalStorage } from 'node:async_hooks';

export interface SSRContext {
  url: string;
  errors: unknown[];
}

export const ssrStorage: AsyncLocalStorage<SSRContext> = new AsyncLocalStorage<SSRContext>();

export function isInSSR(): boolean {
  return ssrStorage.getStore() !== undefined;
}

export function getSSRUrl(): string | undefined {
  return ssrStorage.getStore()?.url;
}

/**
 * Collect an error that occurred during SSR rendering (e.g., from domEffect).
 * No-op when called outside an SSR context.
 */
export function collectSSRError(error: unknown): void {
  ssrStorage.getStore()?.errors.push(error);
}

/**
 * Get all errors collected during the current SSR render.
 * Returns an empty array when called outside an SSR context.
 */
export function getSSRErrors(): unknown[] {
  return ssrStorage.getStore()?.errors ?? [];
}

// Install global function hook so @vertz/ui can check SSR without importing ui-server
(globalThis as any).__VERTZ_IS_SSR__ = isInSSR;
