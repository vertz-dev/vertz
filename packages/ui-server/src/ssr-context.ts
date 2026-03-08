import { AsyncLocalStorage } from 'node:async_hooks';
import type { SSRQueryEntry, SSRRenderContext } from '@vertz/ui/internals';
import { registerSSRResolver } from '@vertz/ui/internals';

export type { SSRQueryEntry } from '@vertz/ui/internals';

export const ssrStorage: AsyncLocalStorage<SSRRenderContext> =
  new AsyncLocalStorage<SSRRenderContext>();

// Register the ALS-backed resolver so @vertz/ui's getSSRContext() returns
// the per-request context during SSR renders.
registerSSRResolver(() => ssrStorage.getStore());

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
export function getSSRQueries(): SSRRenderContext['queries'] {
  return ssrStorage.getStore()?.queries ?? [];
}

/**
 * Set the global SSR timeout for queries that don't specify their own.
 * Called by the virtual SSR entry to propagate the plugin-level ssrTimeout.
 * Stored in the per-request SSR context (AsyncLocalStorage), not on globalThis.
 */
export function setGlobalSSRTimeout(timeout: number): void {
  const store = ssrStorage.getStore();
  if (store) store.globalSSRTimeout = timeout;
}

/**
 * Clear the global SSR timeout (cleanup after render).
 */
export function clearGlobalSSRTimeout(): void {
  const store = ssrStorage.getStore();
  if (store) store.globalSSRTimeout = undefined;
}

/**
 * Get the global SSR timeout for the current SSR context.
 * Returns undefined if not set or outside SSR context.
 */
export function getGlobalSSRTimeout(): number | undefined {
  return ssrStorage.getStore()?.globalSSRTimeout;
}
