/**
 * Client-side SSR data hydration.
 *
 * When the server streams resolved query data via inline `<script>` chunks,
 * the client needs to pick up that data and feed it to the reactive query system.
 *
 * The streaming runtime (injected by the server) creates:
 * - `window.__VERTZ_SSR_DATA__` — buffered array of {key, data} entries
 * - `window.__VERTZ_SSR_PUSH__` — function that pushes to array + dispatches event
 *
 * This module provides:
 * - `hydrateQueryFromSSR()` — check buffer + listen for events
 * - `cleanupSSRData()` — clear globals after hydration is complete
 */

interface SSRDataEntry {
  key: string;
  data: unknown;
}

/** Options for hydrateQueryFromSSR. */
interface HydrateOptions {
  /**
   * When true, the `vertz:ssr-data` listener stays active after the first
   * match instead of auto-removing. Used during nav prefetch so that SWR
   * revalidation data (fresh data arriving after a cache hit) updates the
   * query. The cleanup function still removes the listener on dispose.
   */
  persistent?: boolean;
}

/**
 * Attempt to hydrate a query from SSR-streamed data.
 *
 * 1. Checks the buffered `__VERTZ_SSR_DATA__` array for a matching entry
 * 2. If not found, registers a `vertz:ssr-data` event listener
 * 3. Returns a cleanup function that removes the listener, or null if not SSR
 */
export function hydrateQueryFromSSR(
  key: string,
  resolve: (data: unknown) => void,
  options?: HydrateOptions,
): (() => void) | null {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  const ssrData = (globalThis as any).__VERTZ_SSR_DATA__ as SSRDataEntry[] | undefined;

  // Not an SSR-rendered page — no data to hydrate
  if (!ssrData) return null;

  const persistent = options?.persistent ?? false;

  // Check buffered array first (data arrived before listener)
  const existing = ssrData.find((entry) => entry.key === key);
  if (existing) {
    resolve(existing.data);
    if (!persistent) return () => {};
    // Fall through to register listener for SWR updates
  }

  // Listen for streamed data that arrives later
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SSRDataEntry>).detail;
    if (detail.key === key) {
      resolve(detail.data);
      if (!persistent) {
        document.removeEventListener('vertz:ssr-data', handler);
      }
    }
  };

  document.addEventListener('vertz:ssr-data', handler);

  return () => {
    document.removeEventListener('vertz:ssr-data', handler);
  };
}

/**
 * Clear SSR data globals after hydration is complete.
 * Called once all queries have either received streamed data or started client-side fetching.
 */
export function cleanupSSRData(): void {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  delete (globalThis as any).__VERTZ_SSR_DATA__;
  // biome-ignore lint/suspicious/noExplicitAny: SSR global requires globalThis augmentation
  delete (globalThis as any).__VERTZ_SSR_PUSH__;
}
