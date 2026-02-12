import { effect, signal } from '../runtime/signal';
import type { ReadonlySignal, Signal } from '../runtime/signal-types';
import { untrack } from '../runtime/tracking';
import { type CacheStore, MemoryCache } from './cache';
import { deriveKey } from './key-derivation';

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
}

/** The reactive object returned by query(). */
export interface QueryResult<T> {
  /** The fetched data, or undefined while loading. */
  readonly data: ReadonlySignal<T | undefined>;
  /** True while a fetch is in progress. */
  readonly loading: ReadonlySignal<boolean>;
  /** The error from the latest failed fetch, or undefined. */
  readonly error: ReadonlySignal<unknown>;
  /** Manually trigger a refetch (clears cache for this key). */
  refetch: () => void;
  /** Alias for refetch — revalidate the cached data. */
  revalidate: () => void;
  /** Dispose the query — stops the reactive effect and cleans up inflight state. */
  dispose: () => void;
}

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
 * Create a reactive data-fetching query.
 *
 * The thunk is wrapped in an effect so that when reactive dependencies
 * used *before* the async call change, the query automatically re-fetches.
 *
 * @param thunk - An async function that returns the data.
 * @param options - Optional configuration.
 * @returns A QueryResult with reactive signals for data, loading, and error.
 */
export function query<T>(thunk: () => Promise<T>, options: QueryOptions<T> = {}): QueryResult<T> {
  const {
    initialData,
    debounce: debounceMs,
    enabled = true,
    key: customKey,
    cache = defaultCache as CacheStore<T>,
  } = options;

  const cacheKey = customKey ?? deriveKey(thunk);

  // -- Reactive signals --
  const data: Signal<T | undefined> = signal<T | undefined>(initialData);
  const loading: Signal<boolean> = signal<boolean>(initialData === undefined && enabled);
  const error: Signal<unknown> = signal<unknown>(undefined);

  // If initialData was provided, seed the cache.
  if (initialData !== undefined) {
    cache.set(cacheKey, initialData);
  }

  // Track the latest fetch id to ignore stale responses.
  let fetchId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Trigger signal to force the effect to re-run on manual refetch.
   */
  const refetchTrigger: Signal<number> = signal(0);

  /**
   * Handle a fetch promise: update signals when it resolves/rejects.
   * Ignores stale results if a newer fetch has been started.
   */
  function handleFetchPromise(promise: Promise<T>, id: number): void {
    promise.then(
      (result) => {
        inflight.delete(cacheKey);
        if (id !== fetchId) return; // stale
        cache.set(cacheKey, result);
        data.value = result;
        loading.value = false;
      },
      (err: unknown) => {
        inflight.delete(cacheKey);
        if (id !== fetchId) return; // stale
        error.value = err;
        loading.value = false;
      },
    );
  }

  /**
   * Start a fetch. If an in-flight request exists for the same key,
   * piggybacks on it (deduplication). Otherwise uses the provided promise.
   */
  function startFetch(fetchPromise: Promise<T>): void {
    const id = ++fetchId;

    untrack(() => {
      loading.value = true;
      error.value = undefined;
    });

    // Deduplication: reuse in-flight promise for the same cache key.
    const existing = inflight.get(cacheKey) as Promise<T> | undefined;
    if (existing) {
      handleFetchPromise(existing, id);
      return;
    }

    // Register and handle the fetch promise.
    inflight.set(cacheKey, fetchPromise);
    handleFetchPromise(fetchPromise, id);
  }

  /**
   * Public refetch — clears cache for this key and re-executes.
   */
  function refetch(): void {
    cache.delete(cacheKey);
    inflight.delete(cacheKey);
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
  // For deduplication: if an in-flight request already exists for this
  // cache key, we skip calling the thunk and piggyback on the existing
  // promise instead.
  let disposeFn: (() => void) | undefined;

  if (enabled) {
    let isFirst = true;
    disposeFn = effect(() => {
      // Read the refetch trigger to re-run on manual refetch()
      refetchTrigger.value;

      // Deduplication check: if there is already an in-flight request
      // for this key, piggyback on it without calling the thunk again.
      const existing = untrack(() => inflight.get(cacheKey) as Promise<T> | undefined);
      if (existing) {
        const id = ++fetchId;
        untrack(() => {
          loading.value = true;
          error.value = undefined;
        });
        handleFetchPromise(existing, id);
        isFirst = false;
        return;
      }

      // Call the thunk inside the tracking context so that reactive
      // signals read by the thunk are captured as effect dependencies.
      const promise = thunk();

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
        // Use the tracking promise directly instead of calling thunk() again.
        // This avoids a redundant fetch call in the setTimeout.
        // Previous tracking promises (from rapid dep changes) are invalidated
        // by the fetchId check in handleFetchPromise.
        debounceTimer = setTimeout(() => {
          startFetch(promise);
        }, debounceMs);
      } else {
        startFetch(promise);
      }
    });
  }

  /**
   * Dispose the query — stops the reactive effect and cleans up inflight state.
   */
  function dispose(): void {
    // Dispose the reactive effect to stop re-running on dep changes.
    disposeFn?.();
    // Clear any pending debounce timer.
    clearTimeout(debounceTimer);
    // Invalidate any pending fetch responses by bumping fetchId.
    fetchId++;
    // Clean up inflight entry if this query owns it.
    inflight.delete(cacheKey);
  }

  return {
    data,
    loading,
    error,
    refetch,
    revalidate: refetch,
    dispose,
  };
}
