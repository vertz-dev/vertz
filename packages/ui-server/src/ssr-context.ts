import { AsyncLocalStorage } from 'node:async_hooks';

export interface SSRQueryEntry {
  promise: Promise<unknown>;
  timeout: number;
  resolve: (data: unknown) => void;
  key: string;
  resolved?: boolean;
}

export interface SSRContext {
  url: string;
  errors: unknown[];
  queries: SSRQueryEntry[];
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

/**
 * Register an SSR query for awaiting before final render.
 * No-op when called outside an SSR context.
 */
export function registerSSRQuery(entry: SSRQueryEntry): void {
  ssrStorage.getStore()?.queries.push(entry);
}

/**
 * Get all registered SSR queries for the current render.
 * Returns an empty array when called outside an SSR context.
 */
export function getSSRQueries(): SSRQueryEntry[] {
  return ssrStorage.getStore()?.queries ?? [];
}

/**
 * Set a global default ssrTimeout for all queries in the current render.
 * Per-query ssrTimeout overrides this value.
 * Should be called inside ssrStorage.run() for per-request isolation.
 */
export function setGlobalSSRTimeout(timeout: number): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
  (globalThis as any).__VERTZ_SSR_TIMEOUT__ = timeout;
}

/**
 * Clear the global ssrTimeout after render completes.
 */
export function clearGlobalSSRTimeout(): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
  delete (globalThis as any).__VERTZ_SSR_TIMEOUT__;
}

// Install global function hook so @vertz/ui can check SSR without importing ui-server
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_IS_SSR__ = isInSSR;

// Install global hook for query() to register SSR queries without importing ui-server
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_SSR_REGISTER_QUERY__ = registerSSRQuery;
