import { isQueryDescriptor, type QueryDescriptor } from '@vertz/fetch';
import { isNavPrefetchActive } from '../router/server-nav';
import { computed, lifecycleEffect, signal } from '../runtime/signal';
import type { ReadonlySignal, Signal, Unwrapped } from '../runtime/signal-types';
import { setReadValueCallback, untrack } from '../runtime/tracking';
import { type CacheStore, MemoryCache } from './cache';
import { deriveKey, hashString } from './key-derivation';
import { hydrateQueryFromSSR } from './ssr-hydration';

/** SSR detection — mirrors signal.ts isSSR() via the global hook. */
function isSSR(): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
  const check = typeof globalThis !== 'undefined' && (globalThis as any).__VERTZ_IS_SSR__;
  return typeof check === 'function' ? check() : false;
}

/** Read the global SSR timeout set by the dev server / renderToHTML. */
function getGlobalSSRTimeout(): number | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
  const g = globalThis as any;
  const getter = typeof globalThis !== 'undefined' && g.__VERTZ_GET_GLOBAL_SSR_TIMEOUT__;
  return typeof getter === 'function' ? getter() : undefined;
}

/** Options for query(). */
export interface QueryOptions<T> {
  /** Pre-populated data — skips the initial fetch when provided. */
  initialData?: T;
  /** Debounce re-fetches triggered by reactive dependency changes (ms). */
  debounce?: number;
  /** When false, the query will not fetch. Defaults to true. */
  enabled?: boolean;
  /** Explicit cache key. When omitted, derived from the thunk. */
  key?: string;
  /** Custom cache store. Defaults to a shared in-memory Map. */
  cache?: CacheStore<T>;
  /** Timeout in ms for SSR data loading. Default: 300. Set to 0 to disable. */
  ssrTimeout?: number;
}

/** The reactive object returned by query(). */
export interface QueryResult<T, E = unknown> {
  /** The fetched data, or undefined while loading. */
  readonly data: Unwrapped<ReadonlySignal<T | undefined>>;
  /** True while a fetch is in progress. */
  readonly loading: Unwrapped<ReadonlySignal<boolean>>;
  /** The error from the latest failed fetch, or undefined. */
  readonly error: Unwrapped<ReadonlySignal<E | undefined>>;
  /** Manually trigger a refetch (clears cache for this key). */
  refetch: () => void;
  /** Alias for refetch — revalidate the cached data. */
  revalidate: () => void;
  /** Dispose the query — stops the reactive effect and cleans up inflight state. */
  dispose: () => void;
}

// Re-export Unwrapped for public API
export type { Unwrapped } from '../runtime/signal-types';

/**
 * Global default cache shared across queries that don't supply their own.
 */
const defaultCache = new MemoryCache<unknown>();

/**
 * In-flight promise registry for deduplication.
 * Keyed by cache key — concurrent calls with the same key share a single fetch.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Exposed for testing — returns the current size of the in-flight registry.
 * @internal
 */
export function __inflightSize(): number {
  return inflight.size;
}

/**
 * Clear the default query cache.
 * Called by SSR renders to ensure fresh query discovery on each request.
 * Without this, cached module state causes queries to skip registration
 * on subsequent SSR renders (they find stale cache hits from the first render).
 */
function clearDefaultQueryCache(): void {
  defaultCache.clear();
  inflight.clear();
}

// Install global hook so ui-server can clear the query cache per-request
// without importing @vertz/ui directly (avoids circular deps).
// biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
(globalThis as any).__VERTZ_CLEAR_QUERY_CACHE__ = clearDefaultQueryCache;

/**
 * Create a reactive data-fetching query.
 *
 * The thunk is wrapped in an effect so that when reactive dependencies
 * used *before* the async call change, the query automatically re-fetches.
 *
 * @param source - A QueryDescriptor or an async function that returns the data.
 * @param options - Optional configuration.
 * @returns A QueryResult with reactive signals for data, loading, and error.
 */
export function query<T, E>(
  descriptor: QueryDescriptor<T, E>,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;
export function query<T>(thunk: () => Promise<T>, options?: QueryOptions<T>): QueryResult<T>;
export function query<T, E = unknown>(
  source: QueryDescriptor<T, E> | (() => Promise<T>),
  options: QueryOptions<T> = {},
): QueryResult<T, E> {
  if (isQueryDescriptor<T, E>(source)) {
    return query(() => source._fetch(), { ...options, key: source._key }) as QueryResult<T, E>;
  }

  const thunk = source as () => Promise<T>;
  const {
    initialData,
    debounce: debounceMs,
    enabled = true,
    key: customKey,
    cache = defaultCache as CacheStore<T>,
  } = options;

  const baseKey = deriveKey(thunk);

  // Reactive key derived from the actual signal values read by the thunk.
  // When a dependency changes, the thunk is re-called inside the effect
  // and the captured signal values produce a new hash. Using actual values
  // (instead of a monotonic version counter) means that returning to a
  // previously-seen set of dependencies produces the same cache key,
  // enabling cache hits without re-fetching.
  const depHashSignal: Signal<string> = signal('');
  const cacheKeyComputed = computed(() => {
    const dh = depHashSignal.value;
    return customKey ?? (dh ? `${baseKey}:${dh}` : `${baseKey}:init`);
  });

  /** Read the current reactive cache key. */
  function getCacheKey(): string {
    return cacheKeyComputed.value;
  }

  /**
   * Call the thunk while capturing the values of all signals it reads.
   * Returns the thunk's promise and updates `depHashSignal` with a
   * deterministic hash of the captured values.
   */
  function callThunkWithCapture(): Promise<T> {
    const captured: unknown[] = [];
    const prevCb = setReadValueCallback((v) => captured.push(v));
    let promise: Promise<T>;
    try {
      promise = thunk();
    } finally {
      setReadValueCallback(prevCb);
    }
    // Build a deterministic hash from the captured dependency values.
    const serialized = captured.map((v) => JSON.stringify(v)).join('|');
    untrack(() => {
      depHashSignal.value = hashString(serialized);
    });
    return promise;
  }

  // -- Reactive signals --
  const data: Signal<T | undefined> = signal<T | undefined>(initialData);
  const loading: Signal<boolean> = signal<boolean>(initialData === undefined && enabled);
  const error: Signal<unknown> = signal<unknown>(undefined);

  // If initialData was provided, seed the cache.
  if (initialData !== undefined) {
    cache.set(getCacheKey(), initialData);
  }

  // -- SSR data loading --
  // During SSR, call the thunk and register the promise for renderToHTML() to await.
  // Pass 1 (discovery): registers the query promise for renderToHTML() to await.
  // Pass 2 (render): the cache is already populated — serve from cache.
  const ssrTimeout = options.ssrTimeout ?? getGlobalSSRTimeout() ?? 300;
  if (isSSR() && enabled && ssrTimeout !== 0 && initialData === undefined) {
    // Call the thunk to derive cache key from dependency values.
    const promise = callThunkWithCapture();
    const key = untrack(() => getCacheKey());

    // Check cache first — pass 2 hits this when data was resolved between passes.
    const cached = cache.get(key);
    if (cached !== undefined) {
      // Cache hit: populate signals immediately and suppress the thunk promise.
      promise.catch(() => {});
      data.value = cached;
      loading.value = false;
    } else {
      // Cache miss: register promise for renderToHTML() to await.
      // Suppress unhandled rejection — SSR queries that reject are expected
      // (renderToHTML handles them via Promise.allSettled).
      promise.catch(() => {});
      // biome-ignore lint/suspicious/noExplicitAny: SSR global hook requires globalThis augmentation
      const register = (globalThis as any).__VERTZ_SSR_REGISTER_QUERY__;
      if (typeof register === 'function') {
        register({
          promise,
          timeout: ssrTimeout,
          resolve: (result: unknown) => {
            data.value = result as T;
            loading.value = false;
            cache.set(key, result as T);
          },
          key,
        });
      }
    }
  }

  // -- Client-side SSR hydration --
  // When rendering on the client after SSR, check for streamed data.
  // If the server streamed data for this query, use it instead of fetching.
  let ssrHydrationCleanup: (() => void) | null = null;
  let ssrHydrated = false;
  let navPrefetchDeferred = false;

  if (!isSSR() && enabled && initialData === undefined) {
    // Derive the cache key for hydration matching.
    // For custom keys this is straightforward; for derived keys we need
    // to call the thunk once to capture deps and compute the key.
    const hydrationKey = customKey ?? baseKey;

    ssrHydrationCleanup = hydrateQueryFromSSR(hydrationKey, (result: unknown) => {
      data.value = result as T;
      loading.value = false;
      cache.set(hydrationKey, result as T);
      ssrHydrated = true;
    });

    // If SSR hydration didn't find data in the buffer but a nav prefetch is
    // active, defer the client-side fetch. Wait for the SSE stream to complete
    // before falling back to client fetch. This prevents double-fetching.
    //
    // But first check the query cache — data from a previous visit may still
    // be available. If so, serve it immediately (no loading flash).
    if (!ssrHydrated && ssrHydrationCleanup !== null && isNavPrefetchActive()) {
      if (customKey) {
        const cached = cache.get(customKey);
        if (cached !== undefined) {
          data.value = cached;
          loading.value = false;
          ssrHydrated = true; // Prevents the effect from re-fetching
        }
      }
    }

    if (!ssrHydrated && ssrHydrationCleanup !== null && isNavPrefetchActive()) {
      navPrefetchDeferred = true;
      const doneHandler = () => {
        document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
        // If still no data after prefetch completed, trigger client-side fetch
        if (data.peek() === undefined) {
          refetchTrigger.value = refetchTrigger.peek() + 1;
        }
      };
      document.addEventListener('vertz:nav-prefetch-done', doneHandler);

      // Chain cleanup: both the SSR hydration listener AND the done listener
      // must be removed on dispose/abort.
      const prevCleanup = ssrHydrationCleanup;
      ssrHydrationCleanup = () => {
        prevCleanup?.();
        document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
      };
    }
  }

  // Track the latest fetch id to ignore stale responses.
  let fetchId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Track all in-flight keys for this query instance so dispose() can clean them all.
  const inflightKeys = new Set<string>();

  /**
   * Trigger signal to force the effect to re-run on manual refetch.
   */
  const refetchTrigger: Signal<number> = signal(0);

  /**
   * Handle a fetch promise: update signals when it resolves/rejects.
   * Ignores stale results if a newer fetch has been started.
   * The key is captured at fetch-start time so cleanup targets the correct entry.
   */
  function handleFetchPromise(promise: Promise<T>, id: number, key: string): void {
    promise.then(
      (result) => {
        inflight.delete(key);
        inflightKeys.delete(key);
        if (id !== fetchId) return; // stale
        cache.set(key, result);
        data.value = result;
        loading.value = false;
      },
      (err: unknown) => {
        inflight.delete(key);
        inflightKeys.delete(key);
        if (id !== fetchId) return; // stale
        error.value = err;
        loading.value = false;
      },
    );
  }

  /**
   * Start a fetch. If an in-flight request exists for the same key,
   * piggybacks on it (deduplication). Otherwise uses the provided promise.
   * The key is captured at call time so it matches the thunk's current deps.
   */
  function startFetch(fetchPromise: Promise<T>, key: string): void {
    const id = ++fetchId;

    untrack(() => {
      loading.value = true;
      error.value = undefined;
    });

    // Deduplication: reuse in-flight promise for the same cache key.
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      handleFetchPromise(existing, id, key);
      return;
    }

    // Register and handle the fetch promise.
    inflight.set(key, fetchPromise);
    inflightKeys.add(key);
    handleFetchPromise(fetchPromise, id, key);
  }

  /**
   * Public refetch — clears cache for this key and re-executes.
   */
  function refetch(): void {
    const key = getCacheKey();
    cache.delete(key);
    inflight.delete(key);
    // Bump the trigger to cause the effect to re-run.
    refetchTrigger.value = refetchTrigger.peek() + 1;
  }

  // -- Reactive effect --
  //
  // The thunk is called inside the effect so that any reactive signals
  // read synchronously within the thunk (before the first await) are
  // automatically tracked as dependencies. When those deps change, the
  // effect re-runs, triggering a new fetch.
  //
  // The cache key is derived from the actual values of signals read by
  // the thunk, so identical dependency values produce the same key.
  // This enables cache hits when switching back to previously-fetched
  // dependency combinations.
  let disposeFn: (() => void) | undefined;

  if (enabled) {
    let isFirst = true;
    disposeFn = lifecycleEffect(() => {
      // Read the refetch trigger so this effect re-runs on manual refetch().
      refetchTrigger.value;

      // Skip initial fetch if SSR hydration already provided data.
      if (isFirst && ssrHydrated) {
        isFirst = false;
        return;
      }

      // Nav prefetch active: check cache first (data from a previous visit
      // may still be available), then defer to SSE stream if no cache hit.
      if (isFirst && navPrefetchDeferred) {
        if (customKey) {
          const cached = untrack(() => cache.get(customKey));
          if (cached !== undefined) {
            untrack(() => {
              data.value = cached;
              loading.value = false;
            });
            isFirst = false;
            return;
          }
        }
        // No cache hit — defer to the SSE stream / doneHandler fallback.
        isFirst = false;
        return;
      }

      // When a custom key is provided, deduplication can be checked before
      // calling the thunk — the key is static so the check is reliable.
      if (customKey) {
        const existing = untrack(() => inflight.get(customKey) as Promise<T> | undefined);
        if (existing) {
          const id = ++fetchId;
          untrack(() => {
            loading.value = true;
            error.value = undefined;
          });
          handleFetchPromise(existing, id, customKey);
          isFirst = false;
          return;
        }
      }

      // Call the thunk inside the tracking context so that reactive
      // signals read by the thunk are captured as effect dependencies.
      // callThunkWithCapture also records the actual signal values to
      // produce a deterministic cache key based on dependency values.
      const promise = callThunkWithCapture();

      // Snapshot the cache key for this effect run. The depHashSignal was
      // updated by callThunkWithCapture, so the key now reflects the actual
      // signal values the thunk read.
      const key = untrack(() => getCacheKey());

      // Deduplication check for derived keys: now that the thunk has been
      // called and the dep hash updated, check if an in-flight request
      // exists for this key.
      if (!customKey) {
        const existing = untrack(() => inflight.get(key) as Promise<T> | undefined);
        if (existing) {
          promise.catch(() => {});
          const id = ++fetchId;
          untrack(() => {
            loading.value = true;
            error.value = undefined;
          });
          handleFetchPromise(existing, id, key);
          isFirst = false;
          return;
        }
      }

      // Cache hit: serve data from cache without re-fetching.
      // - On first run with a custom key: check cache to support remounting
      //   a query whose data was previously fetched and is still in the
      //   shared cache (avoids loading flash on page re-navigation).
      // - On subsequent runs with derived keys: check cache when deps change
      //   back to previously-seen values.
      // - On subsequent runs with custom keys: skip — the key is static, so
      //   a cache hit would prevent re-fetching when deps change.
      const shouldCheckCache = isFirst ? !!customKey : !customKey;
      if (shouldCheckCache) {
        const cached = untrack(() => cache.get(key));
        if (cached !== undefined) {
          promise.catch(() => {});
          untrack(() => {
            data.value = cached;
            loading.value = false;
            error.value = undefined;
          });
          isFirst = false;
          return;
        }
      }

      if (isFirst && initialData !== undefined) {
        // Skip the initial fetch when initialData is provided.
        // The thunk was still called above to register reactive deps.
        // Suppress unhandled rejection on the discarded tracking promise.
        promise.catch(() => {});
        isFirst = false;
        return;
      }
      isFirst = false;

      if (debounceMs !== undefined && debounceMs > 0) {
        clearTimeout(debounceTimer);
        // Suppress unhandled rejection on the debounced promise in case a
        // future signal change clears the timer before it fires. Without
        // this, the orphaned promise would reject with no handler attached.
        promise.catch(() => {});
        // Use the tracking promise directly instead of calling thunk() again.
        // This avoids a redundant fetch call in the setTimeout.
        // Previous tracking promises (from rapid dep changes) are invalidated
        // by the fetchId check in handleFetchPromise.
        debounceTimer = setTimeout(() => {
          startFetch(promise, key);
        }, debounceMs);
      } else {
        startFetch(promise, key);
      }
    });
  }

  /**
   * Dispose the query — stops the reactive effect and cleans up inflight state.
   */
  function dispose(): void {
    // Dispose the reactive effect to stop re-running on dep changes.
    disposeFn?.();
    // Clean up SSR hydration listener if still active.
    ssrHydrationCleanup?.();
    // Clear any pending debounce timer.
    clearTimeout(debounceTimer);
    // Invalidate any pending fetch responses by bumping fetchId.
    fetchId++;
    // Clean up ALL in-flight entries for this query instance, not just the
    // current version. Without this, old versioned keys (v0, v1, ...) would
    // leak in the global inflight map if the query is disposed while multiple
    // fetches are still pending (BLOCKING 2 fix).
    for (const key of inflightKeys) {
      inflight.delete(key);
    }
    inflightKeys.clear();
  }

  // Return signals with type casts to match the unwrapped return types
  return {
    data: data as unknown as Unwrapped<ReadonlySignal<T | undefined>>,
    loading: loading as unknown as Unwrapped<ReadonlySignal<boolean>>,
    error: error as unknown as Unwrapped<ReadonlySignal<E | undefined>>,
    refetch,
    revalidate: refetch,
    dispose,
  };
}
