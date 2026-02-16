import { computed, effect, signal } from '../runtime/signal';
import { setReadValueCallback, untrack } from '../runtime/tracking';
import { MemoryCache } from './cache';
import { deriveKey, hashString } from './key-derivation';

/**
 * Global default cache shared across queries that don't supply their own.
 */
const defaultCache = new MemoryCache();
/**
 * In-flight promise registry for deduplication.
 * Keyed by cache key — concurrent calls with the same key share a single fetch.
 */
const inflight = new Map();
/**
 * Exposed for testing — returns the current size of the in-flight registry.
 * @internal
 */
export function __inflightSize() {
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
export function query(thunk, options = {}) {
  const {
    initialData,
    debounce: debounceMs,
    enabled = true,
    key: customKey,
    cache = defaultCache,
  } = options;
  const baseKey = deriveKey(thunk);
  // Reactive key derived from the actual signal values read by the thunk.
  // When a dependency changes, the thunk is re-called inside the effect
  // and the captured signal values produce a new hash. Using actual values
  // (instead of a monotonic version counter) means that returning to a
  // previously-seen set of dependencies produces the same cache key,
  // enabling cache hits without re-fetching.
  const depHashSignal = signal('');
  const cacheKeyComputed = computed(() => {
    const dh = depHashSignal.value;
    return customKey ?? (dh ? `${baseKey}:${dh}` : `${baseKey}:init`);
  });
  /** Read the current reactive cache key. */
  function getCacheKey() {
    return cacheKeyComputed.value;
  }
  /**
   * Call the thunk while capturing the values of all signals it reads.
   * Returns the thunk's promise and updates `depHashSignal` with a
   * deterministic hash of the captured values.
   */
  function callThunkWithCapture() {
    const captured = [];
    const prevCb = setReadValueCallback((v) => captured.push(v));
    let promise;
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
  const data = signal(initialData);
  const loading = signal(initialData === undefined && enabled);
  const error = signal(undefined);
  // If initialData was provided, seed the cache.
  if (initialData !== undefined) {
    cache.set(getCacheKey(), initialData);
  }
  // Track the latest fetch id to ignore stale responses.
  let fetchId = 0;
  let debounceTimer;
  // Track all in-flight keys for this query instance so dispose() can clean them all.
  const inflightKeys = new Set();
  /**
   * Trigger signal to force the effect to re-run on manual refetch.
   */
  const refetchTrigger = signal(0);
  /**
   * Handle a fetch promise: update signals when it resolves/rejects.
   * Ignores stale results if a newer fetch has been started.
   * The key is captured at fetch-start time so cleanup targets the correct entry.
   */
  function handleFetchPromise(promise, id, key) {
    promise.then(
      (result) => {
        inflight.delete(key);
        inflightKeys.delete(key);
        if (id !== fetchId) return; // stale
        cache.set(key, result);
        data.value = result;
        loading.value = false;
      },
      (err) => {
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
  function startFetch(fetchPromise, key) {
    const id = ++fetchId;
    untrack(() => {
      loading.value = true;
      error.value = undefined;
    });
    // Deduplication: reuse in-flight promise for the same cache key.
    const existing = inflight.get(key);
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
  function refetch() {
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
  let disposeFn;
  if (enabled) {
    let isFirst = true;
    disposeFn = effect(() => {
      // Read the refetch trigger so this effect re-runs on manual refetch().
      refetchTrigger.value;
      // When a custom key is provided, deduplication can be checked before
      // calling the thunk — the key is static so the check is reliable.
      if (customKey) {
        const existing = untrack(() => inflight.get(customKey));
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
        const existing = untrack(() => inflight.get(key));
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
      // Cache hit: if the cache already has data for this key (e.g. the
      // user switched back to a previously-fetched dependency combination),
      // serve it from cache without re-fetching.
      if (!isFirst && !customKey) {
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
  function dispose() {
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
//# sourceMappingURL=query.js.map
