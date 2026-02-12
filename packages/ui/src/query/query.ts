import { computed, effect, signal } from '../runtime/signal';
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
 * Exposed for testing — returns the current size of the in-flight registry.
 * @internal
 */
export function __inflightSize(): number {
  return inflight.size;
}

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

  const baseKey = deriveKey(thunk);

  // Reactive key version — incremented inside the effect each time reactive
  // dependencies change. Combined with the base key to produce a cache key
  // that updates when the thunk's signal dependencies change.
  const keyVersionSignal: Signal<number> = signal(0);
  const cacheKeyComputed = computed(() => customKey ?? `${baseKey}:v${keyVersionSignal.value}`);

  /** Read the current reactive cache key. */
  function getCacheKey(): string {
    return cacheKeyComputed.value;
  }

  // -- Reactive signals --
  const data: Signal<T | undefined> = signal<T | undefined>(initialData);
  const loading: Signal<boolean> = signal<boolean>(initialData === undefined && enabled);
  const error: Signal<unknown> = signal<unknown>(undefined);

  // If initialData was provided, seed the cache.
  if (initialData !== undefined) {
    cache.set(getCacheKey(), initialData);
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
  // The cache key is reactive: each time the effect re-runs due to a
  // dependency change (not a refetch), the key version is bumped so that
  // deduplication and cache operations use a fresh key.
  let disposeFn: (() => void) | undefined;

  if (enabled) {
    let isFirst = true;
    let prevRefetchTrigger = refetchTrigger.peek();
    disposeFn = effect(() => {
      // Read the refetch trigger to re-run on manual refetch()
      const currentTrigger = refetchTrigger.value;

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
      const promise = thunk();

      // Bump the key version when the effect re-runs due to a dependency
      // change (not a manual refetch, which manages its own key).
      const isRefetch = currentTrigger !== prevRefetchTrigger;
      prevRefetchTrigger = currentTrigger;
      if (!isFirst && !isRefetch && !customKey) {
        untrack(() => {
          // Capture the old key before bumping the version so we can clean it up.
          const oldKey = getCacheKey();
          keyVersionSignal.value = keyVersionSignal.peek() + 1;
          // Delete the stale cache entry for the previous version to prevent
          // unbounded memory growth (BLOCKING 1 fix).
          cache.delete(oldKey);
        });
      }

      // Snapshot the cache key for this effect run.
      const key = untrack(() => getCacheKey());

      // Deduplication check for derived keys: now that the thunk has been
      // called and the key version has been bumped, check if an in-flight
      // request exists for the new key.
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

  return {
    data,
    loading,
    error,
    refetch,
    revalidate: refetch,
    dispose,
  };
}
