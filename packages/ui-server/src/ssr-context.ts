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
  /** Per-request global ssrTimeout override (ms). */
  ssrTimeout?: number;
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
 * Stored in the per-request SSR context (AsyncLocalStorage), not on globalThis.
 */
export function setGlobalSSRTimeout(timeout: number): void {
  const store = ssrStorage.getStore();
  if (store) {
    store.ssrTimeout = timeout;
  }
}

/**
 * Clear the global ssrTimeout after render completes.
 */
export function clearGlobalSSRTimeout(): void {
  const store = ssrStorage.getStore();
  if (store) {
    store.ssrTimeout = undefined;
  }
}

/**
 * Get the global ssrTimeout for the current SSR context.
 * Returns undefined if not set or outside SSR context.
 */
function getGlobalSSRTimeout(): number | undefined {
  return ssrStorage.getStore()?.ssrTimeout;
}

// Install global function hook so @vertz/ui can check SSR without importing ui-server
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_IS_SSR__ = isInSSR;

// Install global hook for query() to register SSR queries without importing ui-server
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_SSR_REGISTER_QUERY__ = registerSSRQuery;

// Install global hook for query() to read per-request ssrTimeout without importing ui-server
// This is a FUNCTION (not a property) so it reads from the current AsyncLocalStorage context,
// making it safe for concurrent requests.
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_SSR_GET_TIMEOUT__ = getGlobalSSRTimeout;
