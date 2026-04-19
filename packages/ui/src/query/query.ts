import {
  type EntityQueryMeta,
  isQueryDescriptor,
  type QueryDescriptor,
  type Result,
} from '@vertz/fetch';
import { isBrowser } from '../env/is-browser';
import { isNavPrefetchActive } from '../router/server-nav';
import { _tryOnCleanup } from '../runtime/disposal';
import { computed, lifecycleEffect, signal } from '../runtime/signal';
import type { ReadonlySignal, Signal, Unwrapped } from '../runtime/signal-types';
import { setReadValueCallback, untrack } from '../runtime/tracking';
import { getSSRContext } from '../ssr/ssr-render-context';
import type { EntityStore as EntityStoreType } from '../store/entity-store';
import { getEntityStore, getQueryEnvelopeStore } from '../store/entity-store-singleton';
import { getMutationEventBus } from '../store/mutation-event-bus-singleton';
import type { QueryEnvelope } from '../store/query-envelope-store';
import { resolveReferences } from '../store/resolve';
import { type CacheStore, MemoryCache } from './cache';
import { registerActiveQuery } from './invalidate';
import { deriveKey, hashString } from './key-derivation';
import { serializeQueryKey } from './key-serialization';
import { hydrateQueryFromSSR } from './ssr-hydration';

/** SSR detection via the SSRRenderContext resolver. */
function isSSR(): boolean {
  return getSSRContext() !== undefined;
}

/** Read the per-request SSR timeout from the SSR context. */
function getGlobalSSRTimeout(): number | undefined {
  return getSSRContext()?.globalSSRTimeout;
}

/**
 * Reason attached to a stream query's AbortSignal when the query disposes
 * (or is reset by refetch / reactive key change).  Producers can inspect
 * `signal.reason instanceof QueryDisposedReason` to distinguish framework
 * cancellations from user-initiated aborts.
 */
export class QueryDisposedReason extends Error {
  constructor() {
    super('query() disposed');
    this.name = 'QueryDisposedReason';
  }
}

/**
 * Thrown when a stream query is misused — currently:
 *   - `refetchInterval` passed alongside an AsyncIterable source
 *   - source-type swap mid-flight (Phase 2)
 *   - missing `key` (streams require an explicit key)
 */
export class QueryStreamMisuseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryStreamMisuseError';
  }
}

/** Options for a stream-backed query.  See QueryOptions for promise queries. */
export interface QueryStreamOptions {
  /**
   * Cache key — required for stream queries.  String passes through;
   * tuples are normalized via serializeQueryKey().
   */
  key: string | readonly unknown[];
}

/** The reactive object returned by a stream-backed query. */
export interface QueryStreamResult<T> {
  /** Accumulated yields. Starts at [] (never undefined). */
  readonly data: Unwrapped<ReadonlySignal<T[]>>;
  /** True until the first yield (or first error). */
  readonly loading: Unwrapped<ReadonlySignal<boolean>>;
  /**
   * True between a refetch / restart and the next first yield, when data
   * already had items pre-cancel.  Mirrors `revalidating` from QueryResult.
   */
  readonly reconnecting: Unwrapped<ReadonlySignal<boolean>>;
  /** Last error from the iterator. Iteration halts after this is set. */
  readonly error: Unwrapped<ReadonlySignal<unknown>>;
  /** True when the thunk has not yet been invoked (or returned null). */
  readonly idle: Unwrapped<ReadonlySignal<boolean>>;
  /** Cancel the current iterator, reset data to [], start a new iterator. */
  refetch: () => void;
  /** Alias for refetch. */
  revalidate: () => void;
  /** Cancel the iterator and clean up. */
  dispose: () => void;
}

function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
  );
}

/** Options for query(). */
export interface QueryOptions<T> {
  /** Pre-populated data — skips the initial fetch when provided. */
  initialData?: T;
  /** Debounce re-fetches triggered by reactive dependency changes (ms). */
  debounce?: number;
  /** Explicit cache key. When omitted, derived from the thunk. */
  key?: string;
  /** Custom cache store. Defaults to a shared in-memory Map. */
  cache?: CacheStore<T>;
  /** Timeout in ms for SSR data loading. Default: 300. Set to 0 to disable. */
  ssrTimeout?: number;
  /**
   * Polling interval in ms, or a function for dynamic intervals.
   *
   * - `number` — fixed interval in ms
   * - `false` or `0` — disabled
   * - `(data, iteration) => number | false` — called after each fetch to
   *   determine the next interval. Return `false` to stop polling.
   *   `iteration` counts polls since the last start/restart (resets to 0
   *   when the function returns `false`).
   */
  refetchInterval?: number | false | ((data: T | undefined, iteration: number) => number | false);
  /** @internal Entity metadata for entity-backed queries. Set by descriptor overload. */
  _entityMeta?: EntityQueryMeta;
}

/** The reactive object returned by query(). */
export interface QueryResult<T, E = unknown> {
  /** The fetched data, or undefined while loading. */
  readonly data: Unwrapped<ReadonlySignal<T | undefined>>;
  /** True only on the initial load (no data yet). False during revalidation. */
  readonly loading: Unwrapped<ReadonlySignal<boolean>>;
  /** True when refetching while stale data is already available. */
  readonly revalidating: Unwrapped<ReadonlySignal<boolean>>;
  /** The error from the latest failed fetch, or undefined. */
  readonly error: Unwrapped<ReadonlySignal<E | undefined>>;
  /** True when the query has never fetched (thunk returned null or not yet run). */
  readonly idle: Unwrapped<ReadonlySignal<boolean>>;
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

/** Get the active query cache (SSR context-aware). */
function getDefaultCache(): MemoryCache<unknown> {
  const ctx = getSSRContext();
  if (ctx) return ctx.queryCache;
  return defaultCache;
}

/** Get the active inflight map (SSR context-aware). */
function getInflight(): Map<string, Promise<unknown>> {
  const ctx = getSSRContext();
  if (ctx) return ctx.inflight;
  return inflight;
}

/**
 * Exposed for testing — returns the current size of the in-flight registry.
 * @internal
 */
export function __inflightSize(): number {
  return getInflight().size;
}

/**
 * Reset the module-level default query cache and in-flight registry.
 * Used by tests to ensure clean state between test cases.
 * In SSR, per-request isolation provides fresh instances automatically.
 * @internal — test utility only, not part of the public API.
 */
export function resetDefaultQueryCache(): void {
  defaultCache.clear();
  inflight.clear();
}

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
export function query<T>(
  thunk: (signal?: AbortSignal) => AsyncIterable<T> | null,
  options: QueryStreamOptions,
): QueryStreamResult<T>;
export function query<T, E>(
  descriptor: QueryDescriptor<T, E>,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;
export function query<T, E>(
  thunk: () => QueryDescriptor<T, E> | null,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T, E>;
export function query<T>(
  thunk: (signal?: AbortSignal) => Promise<T> | null,
  options?: QueryOptions<T>,
): QueryResult<T>;
export function query<T, E = unknown>(
  source:
    | QueryDescriptor<T, E>
    | ((signal?: AbortSignal) => QueryDescriptor<T, E> | Promise<T> | AsyncIterable<T> | null),
  rawOptions: QueryOptions<T> | QueryStreamOptions = {},
): QueryResult<T, E> | QueryStreamResult<T> {
  // Normalize options: tuple keys get serialized to strings so the rest of the
  // function can treat options uniformly as QueryOptions<T>.  The original
  // tuple is preserved on the local var so the stream-mode mutual-exclusion
  // check can still detect a missing `key`.
  const options: QueryOptions<T> = (() => {
    const o = rawOptions as QueryOptions<T> & { key?: string | readonly unknown[] };
    if (o.key !== undefined && typeof o.key !== 'string') {
      return { ...o, key: serializeQueryKey(o.key) };
    }
    return o as QueryOptions<T>;
  })();

  if (isQueryDescriptor<T, E>(source)) {
    const entityMeta = source._entity;
    return query(
      async () => {
        const result = (await source._fetch()) as Result<T, E>;
        if (!result.ok) throw result.error;
        return result.data;
      },
      { ...options, key: source._key, _entityMeta: entityMeta },
    ) as QueryResult<T, E>;
  }

  // Stream classification happens inside the effect below (after the first
  // callThunkWithCapture) so promise thunks aren't double-invoked.

  // Mutation-bus and registry subscription handles.
  //
  // Declared at the top of the function body so they are guaranteed to be
  // initialized before ANY code — including lifecycleEffect's synchronous
  // first run and the hoisted `dispose` function — can reference them.
  //
  // Earlier fix (#1819 / PR #1822) placed these before lifecycleEffect,
  // but bundlers that inline or scope-hoist the function can reorder `let`
  // declarations, re-creating the TDZ in the compiled output.  Placing
  // them as the first statements after the early return makes reordering
  // past the function entry point impossible.
  let unsubscribeBus: (() => void) | undefined;
  let unregisterFromRegistry: (() => void) | undefined;

  const thunk = source as () => QueryDescriptor<T, E> | Promise<T> | null;
  const {
    initialData,
    debounce: debounceMs,
    key: customKey,
    cache = getDefaultCache() as CacheStore<T>,
    _entityMeta: optionsEntityMeta,
  } = options;

  // Entity metadata — set from options (descriptor overload) or lazily from
  // a descriptor returned by the thunk (descriptor-in-thunk pattern).
  let entityMeta: EntityQueryMeta | undefined = optionsEntityMeta;

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
   * Resolve the current cache key using the same logic as the effect path.
   * For descriptor-in-thunk queries, combines the descriptor _key with the
   * dep hash. For plain thunks, delegates to getCacheKey().
   */
  function resolveCurrentCacheKey(): string {
    if (currentEffectKey) {
      const depHash = depHashSignal.peek();
      return depHash ? `${currentEffectKey}:${depHash}` : currentEffectKey;
    }
    return getCacheKey();
  }

  // -- Orphan-aware cache eviction --
  // Track the cache key currently retained by this query instance.
  // When the key changes (dep change) or the query disposes, release the old key.
  let currentRetainedKey: string | null = null;
  const retainable = 'retain' in cache && 'release' in cache;

  function retainKey(key: string): void {
    if (!retainable) return;
    if (currentRetainedKey === key) return;
    if (currentRetainedKey !== null) {
      (cache as MemoryCache<T>).release(currentRetainedKey);
    }
    (cache as MemoryCache<T>).retain(key);
    currentRetainedKey = key;
  }

  function releaseCurrentKey(): void {
    if (!retainable || currentRetainedKey === null) return;
    (cache as MemoryCache<T>).release(currentRetainedKey);
    currentRetainedKey = null;
  }

  /**
   * Call the thunk while capturing the values of all signals it reads.
   * Returns the raw thunk result and updates `depHashSignal` with a
   * deterministic hash of the captured values.
   *
   * The caller must classify the result:
   * - `null` → skip fetch (thunk says "not ready")
   * - `QueryDescriptor` → decompose into promise + key + entity metadata
   * - `Promise<T>` → existing fetch behavior
   * - `AsyncIterable<T>` → stream pump (Phase 1)
   *
   * The optional `signal` is passed to the thunk's first parameter — stream
   * thunks consume it for cancellation; promise / descriptor thunks ignore it.
   * Phase 1 always passes a never-aborted signal so signal-aware thunks don't
   * crash on `signal.addEventListener(...)`. Phase 2 wires real abort.
   */
  function callThunkWithCapture(
    signal?: AbortSignal,
  ): QueryDescriptor<T, E> | Promise<T> | AsyncIterable<T> | null {
    const captured: unknown[] = [];
    const prevCb = setReadValueCallback((v) => captured.push(v));
    let result: QueryDescriptor<T, E> | Promise<T> | AsyncIterable<T> | null;
    try {
      result = (thunk as (s?: AbortSignal) => typeof result)(signal);
    } finally {
      setReadValueCallback(prevCb);
    }
    // Build a deterministic hash from the captured dependency values.
    const serialized = captured.map((v) => JSON.stringify(v)).join('|');
    untrack(() => {
      depHashSignal.value = hashString(serialized);
    });
    return result;
  }

  // -- Reactive signals --
  const rawData: Signal<T | undefined> = signal<T | undefined>(initialData);
  const loading: Signal<boolean> = signal<boolean>(initialData === undefined);
  const revalidating: Signal<boolean> = signal<boolean>(false);
  const error: Signal<unknown> = signal<unknown>(undefined);
  const idle: Signal<boolean> = signal<boolean>(initialData === undefined);
  // Stream-mode state (Phase 2: per-pump AbortController, iterator.return on
  // dispose, refetch resets, reactive-key restart, source-type lock).
  const reconnecting: Signal<boolean> = signal<boolean>(false);
  let streamMode = false;
  let currentStreamController: AbortController | undefined;
  let currentStreamIterator: AsyncIterator<unknown> | undefined;
  // Source-type lock: set on first non-null classification.  Subsequent
  // classifications that disagree throw QueryStreamMisuseError per design doc.
  let firstClassifiedMode: 'stream' | 'promise' | 'descriptor' | undefined;
  // Phase 3: per-thunk-call AbortController for promise/descriptor mode too.
  // Aborted on dispose / refetch / dep change so signal-aware promise thunks
  // (e.g., `(signal) => fetch(url, { signal })`) can cancel in-flight work.
  let currentPromiseController: AbortController | undefined;

  // Entity-backed source switcher: when entityMeta is present,
  // data reads from EntityStore instead of rawData.
  // Uses a signal so the computed properly tracks the transition.
  const entityBacked: Signal<boolean> = signal<boolean>(false);

  // Dev-only: mark user-facing signals for state inspection grouping (#2047).
  // The state inspector uses _queryGroup to aggregate query signals
  // into named QuerySnapshot objects instead of listing them flat.
  // Only the 5 user-facing signals are marked — internal signals
  // (depHashSignal, entityBacked, refetchTrigger) are excluded.
  const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
  const _queryGroupKey = customKey ?? baseKey;
  if (__DEV__) {
    const userFacingSignals: [Signal<unknown>, string][] = [
      [rawData as Signal<unknown>, 'data'],
      [loading as Signal<unknown>, 'loading'],
      [revalidating as Signal<unknown>, 'revalidating'],
      [error, 'error'],
      [idle as Signal<unknown>, 'idle'],
    ];
    for (const [sig, hmrKey] of userFacingSignals) {
      const rec = sig as unknown as Record<string, unknown>;
      rec._queryGroup = _queryGroupKey;
      rec._hmrKey = hmrKey;
    }
  }

  // Track the descriptor _key from the last effect run so that refetch()
  // and clearData() use the same cache key format as the effect path.
  // Without this, descriptor-in-thunk queries use getCacheKey() which
  // produces a different key (baseKey:depHash) than the effect path
  // (effectKey:depHash), causing cache eviction to miss (#1891).
  let currentEffectKey: string | undefined;

  /**
   * Normalize fetch result into EntityStore for entity-backed queries.
   * For 'get' queries: merges the single entity.
   * For 'list' queries: merges all items and stores the ID index + envelope.
   *
   * IMPORTANT: This must be called BEFORE setting rawData.value so that
   * entityBacked is true when the computed re-evaluates from the rawData write.
   */
  function normalizeToEntityStore(result: T): void {
    if (!entityMeta) return;
    const store = getEntityStore();
    if (entityMeta.kind === 'get' && result && typeof result === 'object' && 'id' in result) {
      store.merge(entityMeta.entityType, result as { id: string });
      entityBacked.value = true;
    }
    if (entityMeta.kind === 'list' && result && typeof result === 'object') {
      const listResult = result as { items?: { id: string }[] };
      if (Array.isArray(listResult.items)) {
        store.merge(entityMeta.entityType, listResult.items);
        const ids = listResult.items.map((item) => item.id);
        const queryKey = customKey ?? entityMeta.entityType;
        store.queryIndices.set(queryKey, ids);
        // Store envelope metadata (pagination info) separately
        const { items: _, ...rest } = result as Record<string, unknown>;
        if (Object.keys(rest).length > 0) {
          getQueryEnvelopeStore().set(queryKey, rest as QueryEnvelope);
        }
        entityBacked.value = true;
      }
    }
  }

  // Track referenced entity keys for ref counting (Phase 4)
  const referencedKeys = new Set<string>();

  // Capture the initial entity metadata for the data computed.
  // For the direct descriptor overload, this is set immediately.
  // For descriptor-in-thunk, it starts undefined and the data computed
  // uses rawData directly until entity metadata is lazily set.
  const initialEntityMeta = entityMeta;

  const data: ReadonlySignal<T | undefined> = initialEntityMeta
    ? computed(() => {
        if (!entityBacked.value) return rawData.value;
        // Subscribe to rawData so refetches trigger re-evaluation.
        // normalizeToEntityStore updates query indices before rawData is written,
        // so re-reading indices here picks up new/removed entity IDs.
        const raw = rawData.value;
        const store = getEntityStore();
        const newKeys = new Set<string>();

        if (initialEntityMeta.kind === 'get' && initialEntityMeta.id) {
          const entity = store.get(initialEntityMeta.entityType, initialEntityMeta.id).value;
          if (!entity) {
            updateRefCounts(store, referencedKeys, newKeys);
            return undefined;
          }
          const resolved = resolveReferences(
            entity as Record<string, unknown>,
            initialEntityMeta.entityType,
            store,
            undefined,
            newKeys,
          ) as T;
          updateRefCounts(store, referencedKeys, newKeys);
          return resolved;
        }
        // For list queries, reconstruct envelope + items from store
        const queryKey = customKey ?? initialEntityMeta.entityType;
        const ids = store.queryIndices.get(queryKey);
        if (ids) {
          const items = ids
            .map((id) => {
              const entity = store.get(initialEntityMeta.entityType, id).value;
              if (!entity) return null;
              return resolveReferences(
                entity as Record<string, unknown>,
                initialEntityMeta.entityType,
                store,
                undefined,
                newKeys,
              );
            })
            .filter((item): item is NonNullable<typeof item> => item != null);
          // Reconstruct the original response shape with live entity data
          const envelope = getQueryEnvelopeStore().get(queryKey);
          updateRefCounts(store, referencedKeys, newKeys);
          return { ...envelope, items } as unknown as T;
        }
        updateRefCounts(store, referencedKeys, newKeys);
        return raw;
      })
    : rawData;

  // If initialData was provided, seed the cache.
  if (initialData !== undefined) {
    const initKey = getCacheKey();
    cache.set(initKey, initialData);
    retainKey(initKey);
  }

  // -- SSR data loading --
  // During SSR, call the thunk and register the promise for renderToHTML() to await.
  // Pass 1 (discovery): registers the query promise for renderToHTML() to await.
  // Pass 2 (render): the cache is already populated — serve from cache.
  const ssrTimeout = options.ssrTimeout ?? getGlobalSSRTimeout() ?? 300;
  if (isSSR() && ssrTimeout !== 0 && initialData === undefined) {
    // Call the thunk to derive cache key from dependency values.
    const ssrRaw = callThunkWithCapture();

    // Null return: thunk says "not ready" — skip SSR data loading.
    // Dependent chains won't resolve during SSR (known limitation).
    if (ssrRaw === null) {
      // No SSR promise registered — the client will fetch when deps are ready.
      loading.value = false;
    } else {
      // Decompose descriptor if needed.
      let ssrPromise: Promise<T>;
      if (isQueryDescriptor<T, E>(ssrRaw)) {
        const fetchResult = ssrRaw._fetch();
        ssrPromise = fetchResult.then((result: Result<T, E>) => {
          if (!result.ok) throw result.error;
          return result.data;
        });
        if (ssrRaw._entity && !entityMeta) {
          entityMeta = ssrRaw._entity;
        }
      } else {
        ssrPromise = ssrRaw as Promise<T>;
      }
      const key = untrack(() => getCacheKey());

      // Check cache first — pass 2 hits this when data was resolved between passes.
      const cached = cache.get(key);
      if (cached !== undefined) {
        // Cache hit: populate signals immediately and suppress the thunk promise.
        ssrPromise.catch(() => {});
        normalizeToEntityStore(cached);
        rawData.value = cached;
        loading.value = false;
        idle.value = false;
      } else {
        // Cache miss: register promise for renderToHTML() to await.
        // Suppress unhandled rejection — SSR queries that reject are expected
        // (renderToHTML handles them via Promise.allSettled).
        ssrPromise.catch(() => {});
        const ctx = getSSRContext();
        if (ctx) {
          ctx.queries.push({
            promise: ssrPromise,
            timeout: ssrTimeout,
            resolve: (result: unknown) => {
              normalizeToEntityStore(result as T);
              rawData.value = result as T;
              loading.value = false;
              idle.value = false;
              cache.set(key, result as T);
            },
            key,
          });
        }
      }
    } // end: ssrRaw !== null
  }

  // -- Client-side SSR hydration --
  // When rendering on the client after SSR, check for streamed data.
  // If the server streamed data for this query, use it instead of fetching.
  let ssrHydrationCleanup: (() => void) | null = null;
  let ssrHydrated = false;
  let navPrefetchDeferred = false;

  if (!isSSR() && initialData === undefined) {
    // Derive the cache key for hydration matching.
    // For custom keys this is straightforward. For derived keys, we must
    // call the thunk to capture signal values and compute the dep hash —
    // SSR stores data with the full dep-hash key (baseKey:depHash), so
    // looking up just baseKey would never match. (#1859)
    let hydrationKey: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSR global
    const hasSSRData = !!(globalThis as any).__VERTZ_SSR_DATA__;

    // Descriptor key from the init-time thunk probe — used as a prefix for
    // cache lookups when the exact key misses (auto-field-selection adds params
    // like `select` that aren't present at init time).
    let initDescriptorKey: string | undefined;

    if (customKey) {
      hydrationKey = customKey;
    } else if (hasSSRData) {
      // Only probe the thunk for dep hash when SSR data exists — avoids
      // an unnecessary thunk invocation on pure client-side navigations.
      try {
        const raw = callThunkWithCapture();
        if (raw !== null) {
          if (isQueryDescriptor<T, E>(raw)) {
            // Descriptor: capture entity metadata but don't call _fetch()
            initDescriptorKey = raw._key;
            if (raw._entity && !entityMeta) {
              entityMeta = raw._entity;
            }
          } else {
            // Promise thunk: suppress the eagerly-fired fetch
            (raw as Promise<T>).catch(() => {});
          }
        }
      } catch {
        // Thunk error during hydration key derivation — effect will handle it
      }
      hydrationKey = getCacheKey();
    } else {
      hydrationKey = baseKey;
    }

    // During nav prefetch, use persistent: true so the listener stays active
    // for SWR revalidation (fresh data arriving after a cache hit).
    const isNavigation = isNavPrefetchActive();
    ssrHydrationCleanup = hydrateQueryFromSSR(
      hydrationKey,
      (result: unknown) => {
        normalizeToEntityStore(result as T);
        rawData.value = result as T;
        loading.value = false;
        idle.value = false;
        cache.set(hydrationKey, result as T);
        ssrHydrated = true;
      },
      { persistent: isNavigation },
    );

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
          retainKey(customKey);
          normalizeToEntityStore(cached);
          rawData.value = cached;
          loading.value = false;
          ssrHydrated = true; // Prevents the effect from re-fetching
        }
      } else {
        // Derived key: try exact hydrationKey match first.
        const cached = cache.get(hydrationKey);
        if (cached !== undefined) {
          retainKey(hydrationKey);
          normalizeToEntityStore(cached);
          rawData.value = cached;
          loading.value = false;
          ssrHydrated = true;
        } else if (initDescriptorKey && 'findByPrefix' in cache) {
          // Fallback: auto-field-selection adds params (e.g. `select`) to the
          // descriptor key that aren't present at init time, causing the exact
          // match above to miss.  The init descriptor key (without field-selection)
          // is a prefix of the cached key (with field-selection + depHash).
          // Use delimiter-aware prefix search to avoid false matches
          // (e.g. page=1 matching page=10).
          const mc = cache as MemoryCache<T>;
          const found =
            mc.findByPrefix(initDescriptorKey + '&') ?? mc.findByPrefix(initDescriptorKey + ':');
          if (found) {
            retainKey(found.key);
            normalizeToEntityStore(found.value);
            rawData.value = found.value;
            loading.value = false;
            ssrHydrated = true;
          }
        }
      }
    }

    if (!ssrHydrated && ssrHydrationCleanup !== null && isNavPrefetchActive()) {
      navPrefetchDeferred = true;
      const doneHandler = () => {
        document.removeEventListener('vertz:nav-prefetch-done', doneHandler);
        // Only trigger refetch if no data arrived yet (from cache, SSE, or client fetch)
        if (rawData.peek() === undefined && !ssrHydrated) {
          refetchTrigger.value = refetchTrigger.peek() + 1;
        }
      };
      document.addEventListener('vertz:nav-prefetch-done', doneHandler);

      // Chain cleanup: SSR hydration + done listener
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
  let intervalTimer: ReturnType<typeof setTimeout> | undefined;
  const refetchIntervalOption = options.refetchInterval;
  const hasInterval =
    typeof refetchIntervalOption === 'function' ||
    (typeof refetchIntervalOption === 'number' && refetchIntervalOption > 0);
  let intervalIteration = 0;

  // Track all in-flight keys for this query instance so dispose() can clean them all.
  const inflightKeys = new Set<string>();

  /**
   * Trigger signal to force the effect to re-run on manual refetch.
   */
  const refetchTrigger: Signal<number> = signal(0);

  // -- Polling interval --
  let intervalPaused = false;

  function scheduleInterval(): void {
    if (!hasInterval || isSSR() || intervalPaused) return;

    let ms: number | false;
    if (typeof refetchIntervalOption === 'function') {
      ms = refetchIntervalOption(rawData.peek() as T | undefined, intervalIteration);
    } else {
      ms = refetchIntervalOption as number;
    }

    if (ms === false || ms <= 0) {
      // Stop polling and reset iteration for next restart.
      intervalIteration = 0;
      return;
    }

    intervalIteration++;
    clearTimeout(intervalTimer);
    intervalTimer = setTimeout(() => {
      refetch();
    }, ms);
  }

  // Visibility-based pause/resume for polling
  let visibilityHandler: (() => void) | undefined;
  if (hasInterval && isBrowser()) {
    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        intervalPaused = true;
        clearTimeout(intervalTimer);
      } else {
        intervalPaused = false;
        // Immediately refetch when tab becomes visible again
        refetch();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  /**
   * Handle a fetch promise: update signals when it resolves/rejects.
   * Ignores stale results if a newer fetch has been started.
   * The key is captured at fetch-start time so cleanup targets the correct entry.
   */
  function handleFetchPromise(promise: Promise<T>, id: number, key: string): void {
    promise.then(
      (result) => {
        getInflight().delete(key);
        inflightKeys.delete(key);
        if (id !== fetchId) return; // stale
        cache.set(key, result);
        retainKey(key);
        normalizeToEntityStore(result);
        rawData.value = result;
        loading.value = false;
        revalidating.value = false;
        scheduleInterval();
      },
      (err: unknown) => {
        getInflight().delete(key);
        inflightKeys.delete(key);
        if (id !== fetchId) return; // stale
        error.value = err;
        loading.value = false;
        revalidating.value = false;
        scheduleInterval();
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
      if (rawData.value !== undefined) {
        // Data already exists — this is a revalidation, not a first load
        revalidating.value = true;
      } else {
        loading.value = true;
      }
      error.value = undefined;
    });

    // Deduplication: reuse in-flight promise for the same cache key.
    const existing = getInflight().get(key) as Promise<T> | undefined;
    if (existing) {
      handleFetchPromise(existing, id, key);
      return;
    }

    // Register and handle the fetch promise.
    getInflight().set(key, fetchPromise);
    inflightKeys.add(key);
    handleFetchPromise(fetchPromise, id, key);
  }

  /**
   * Public refetch — clears cache for this key and re-executes.
   *
   * Stream-mode (Phase 2): cancels the current pump (signal abort +
   * iterator.return), resets data to [], sets reconnecting=true if data
   * had items, then bumps the trigger so the effect re-runs and starts a
   * fresh iterator.  The streamMode branch at the top of the effect picks
   * up the bump, calls callThunkWithCapture, and starts the new pump.
   */
  function refetch(): void {
    if (streamMode) {
      const hadItems = ((rawData.peek() as unknown[] | undefined) ?? []).length > 0;
      cancelStreamPump(new QueryDisposedReason());
      untrack(() => {
        rawData.value = [] as unknown as T;
        error.value = undefined;
        if (hadItems) reconnecting.value = true;
      });
      refetchTrigger.value = refetchTrigger.peek() + 1;
      return;
    }
    const key = resolveCurrentCacheKey();
    // Reset retained key so retainKey() re-establishes the ref count
    // after cache.delete() wipes _refs.
    currentRetainedKey = null;
    cache.delete(key);
    getInflight().delete(key);
    // Bump the trigger to cause the effect to re-run.
    refetchTrigger.value = refetchTrigger.peek() + 1;
  }

  /**
   * Pump an AsyncIterable into rawData (treated as T[] in stream mode).
   * Each yield appends; the first yield flips loading -> false, idle -> false.
   * On error, sets error.value and halts.  Phase 2 wires AbortSignal cancellation.
   */
  /**
   * Pump an AsyncIterable into rawData (treated as T[] in stream mode).
   * Owns the iterator handle so dispose() / refetch() / reactive-key change
   * can call iterator.return?.() and respect signal aborts.
   *
   * The signal arg is the AbortController.signal that owns this pump.  When
   * aborted, the loop exits early without writing further yields.
   */
  async function pumpStream(iter: AsyncIterable<unknown>, signal: AbortSignal): Promise<void> {
    const iterator = iter[Symbol.asyncIterator]();
    currentStreamIterator = iterator;
    try {
      while (true) {
        if (signal.aborted) return;
        const step = await iterator.next();
        if (signal.aborted) return;
        if (step.done) break;
        const prev = (rawData.peek() as unknown[] | undefined) ?? [];
        rawData.value = [...prev, step.value] as unknown as T;
        if (loading.peek()) loading.value = false;
        if (idle.peek()) idle.value = false;
        if (reconnecting.peek()) reconnecting.value = false;
      }
      // Iterator completed (StopIteration) — clear loading even if zero yields.
      if (!signal.aborted) {
        if (loading.peek()) loading.value = false;
        if (idle.peek()) idle.value = false;
        if (reconnecting.peek()) reconnecting.value = false;
      }
    } catch (err) {
      // Aborted iterators may surface the abort reason as an error from .next().
      // Suppress that — abort is expected, not a user-facing error.
      if (signal.aborted) return;
      error.value = err;
      if (loading.peek()) loading.value = false;
      if (idle.peek()) idle.value = false;
      if (reconnecting.peek()) reconnecting.value = false;
    } finally {
      // Clear our reference to this iterator only if it's still the current one
      // (a refetch / reactive-key change may have already swapped in a new pump).
      if (currentStreamIterator === iterator) currentStreamIterator = undefined;
    }
  }

  /**
   * Cancel the current stream pump: abort its signal and politely call
   * iterator.return?.() so the producer can release resources.  The .return()
   * call is awaited via Promise.resolve(...).catch(() => {}) so a rejecting
   * cleanup doesn't surface as an unhandled rejection.
   *
   * Idempotent — a second cancel during a still-pending .return() is a no-op
   * (the iterator reference is cleared on the first call, so the second call's
   * lookup returns undefined).  This guards against double-refetch races.
   *
   * Phase 2 helper used by dispose(), refetch(), and reactive-key restart.
   */
  function cancelStreamPump(reason: unknown): void {
    if (currentStreamController && !currentStreamController.signal.aborted) {
      currentStreamController.abort(reason);
    }
    const iter = currentStreamIterator;
    // Clear the reference BEFORE awaiting return() so a re-entry during the
    // pending return doesn't see this iterator and call .return() again.
    currentStreamIterator = undefined;
    if (iter && typeof iter.return === 'function') {
      void Promise.resolve(iter.return()).catch(() => {});
    }
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
  let isFirst = true;
  disposeFn = lifecycleEffect(() => {
    // Read the refetch trigger so this effect re-runs on manual refetch().
    refetchTrigger.value;

    // Stream-mode re-run (Phase 2): when a previous pump exists, abort it and
    // re-classify on the new thunk return.  This drives reactive-key restarts
    // and refetch().  Source-type lock fires here for stream→non-stream swaps.
    if (streamMode) {
      // Pre-create a controller for this iteration; we'll keep it if classification
      // returns AsyncIterable, or discard it otherwise.
      const newController = new AbortController();
      const next = callThunkWithCapture(newController.signal);
      if (next === null) {
        // Thunk says "not ready" mid-stream — keep current pump running.
        return;
      }
      if (!isAsyncIterable(next)) {
        throw new QueryStreamMisuseError(
          'query() was first invoked with an AsyncIterable source and is locked to stream mode. The most recent thunk call returned a non-AsyncIterable value. Conditional source-type swaps are not supported — split the work into two queries with distinct keys, or normalize both branches to one source shape.',
        );
      }
      // Abort the old pump and start the new one.
      cancelStreamPump(new QueryDisposedReason());
      currentStreamController = newController;
      untrack(() => {
        // Reset to empty for the new iteration.  reconnecting is left to the
        // caller (refetch sets it; reactive-key changes default to false here
        // because the user opted into a different source).
        rawData.value = [] as unknown as T;
        if (loading.peek() === false && error.peek() === undefined) {
          // Brief loading spike between iterators is appropriate.
          loading.value = true;
        }
        // The thunk just returned a non-null AsyncIterable, so the query is
        // not idle — even if no yields have landed yet (mirrors first-time
        // classification per Implementation Notes #3).
        idle.value = false;
        error.value = undefined;
      });
      pumpStream(next as AsyncIterable<unknown>, newController.signal).catch((err: unknown) => {
        if (newController.signal.aborted) return;
        error.value = err;
        if (loading.peek()) loading.value = false;
        if (idle.peek()) idle.value = false;
      });
      return;
    }

    // Skip initial fetch if SSR hydration already provided data.
    // When no customKey, still call the thunk so reactive deps are tracked —
    // without this, the effect has no signal dependencies and never re-runs
    // when deps change (e.g. pagination offset). (#1861)
    // With customKey, the cache key is static so dep tracking is unnecessary,
    // and calling the thunk would fire a wasteful fetch for promise thunks.
    if (isFirst && ssrHydrated) {
      if (!customKey) {
        const trackRaw = callThunkWithCapture();
        if (trackRaw !== null) {
          if (isQueryDescriptor<T, E>(trackRaw)) {
            // Descriptor-in-thunk: capture entity metadata lazily but do NOT
            // call _fetch() — SSR already provided data.
            if (trackRaw._entity && !entityMeta) {
              entityMeta = trackRaw._entity;
            }
          } else {
            // Promise thunk: suppress the promise (the thunk call triggered a
            // real fetch as a side effect, but SSR data is authoritative).
            (trackRaw as Promise<T>).catch(() => {});
          }
        }
      }
      isFirst = false;
      return;
    }

    // Nav prefetch active: check cache first (data from a previous visit
    // may still be available), then defer to SSE stream if no cache hit.
    if (isFirst && navPrefetchDeferred) {
      if (customKey) {
        const cached = untrack(() => cache.get(customKey));
        if (cached !== undefined) {
          retainKey(customKey);
          untrack(() => {
            rawData.value = cached;
            loading.value = false;
          });
          isFirst = false;
          return;
        }
      } else {
        // Derived key: call thunk to discover the key, then check cache.
        const trackRaw = callThunkWithCapture();
        if (trackRaw === null) {
          // Thunk not ready — defer to next effect run.
          isFirst = false;
          return;
        }
        // For descriptor-in-thunk, the normal effect path caches under
        // `effectKey:depHash` (e.g., `GET:/tasks?page=1:<hash>`), not
        // `baseKey:depHash`. Use the same key format here so nav-prefetch
        // finds data cached by a previous visit.
        const descriptorKey = isQueryDescriptor(trackRaw) ? trackRaw._key : undefined;
        if (!descriptorKey) {
          (trackRaw as Promise<T>).catch(() => {});
        }
        const depHash = untrack(() => depHashSignal.value);
        const derivedKey = descriptorKey
          ? depHash
            ? `${descriptorKey}:${depHash}`
            : descriptorKey
          : untrack(() => getCacheKey());
        const cached = untrack(() => cache.get(derivedKey));
        if (cached !== undefined) {
          retainKey(derivedKey);
          untrack(() => {
            rawData.value = cached;
            loading.value = false;
          });
          isFirst = false;
          return;
        }
        // Fallback: prefix match on descriptor key (without field-selection
        // params added by auto-field-selection).
        if (descriptorKey && 'findByPrefix' in cache) {
          const mc = cache as MemoryCache<T>;
          const found = untrack(
            () => mc.findByPrefix(descriptorKey + '&') ?? mc.findByPrefix(descriptorKey + ':'),
          );
          if (found) {
            retainKey(found.key);
            untrack(() => {
              normalizeToEntityStore(found.value);
              rawData.value = found.value;
              loading.value = false;
            });
            isFirst = false;
            return;
          }
        }
      }
      // No cache hit — defer to the SSE stream / doneHandler fallback.
      isFirst = false;
      return;
    }

    // When a custom key is provided, deduplication can be checked before
    // calling the thunk — the key is static so the check is reliable.
    if (customKey) {
      const existing = untrack(() => getInflight().get(customKey) as Promise<T> | undefined);
      if (existing) {
        const id = ++fetchId;
        untrack(() => {
          if (rawData.value !== undefined) {
            revalidating.value = true;
          } else {
            loading.value = true;
          }
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
    // Pre-create the controller in case classification picks the stream branch.
    const probeController = new AbortController();
    const raw = callThunkWithCapture(probeController.signal);

    // Null return: thunk says "not ready" — skip fetch, deps are tracked.
    if (raw === null) {
      clearTimeout(debounceTimer);
      untrack(() => {
        loading.value = false;
      });
      isFirst = false;
      return;
    }

    // Stream classification (Phase 2).  AsyncIterable sources route to a
    // dedicated pump owning its own AbortController.  Re-runs of this effect
    // (reactive-key change, refetch) are handled by the streamMode branch at
    // the top of the effect, which aborts the previous pump before re-classifying.
    if (isAsyncIterable(raw)) {
      // Source-type lock: if a previous classification settled on a different
      // mode, refuse to swap.
      if (firstClassifiedMode && firstClassifiedMode !== 'stream') {
        throw new QueryStreamMisuseError(
          `query() was first invoked with a ${firstClassifiedMode} source and is locked to that mode. The most recent thunk call returned an AsyncIterable. Conditional source-type swaps are not supported.`,
        );
      }
      // Mutual exclusion: refetchInterval is incompatible with streams.
      const ri = options.refetchInterval;
      if (ri !== undefined && ri !== false && ri !== 0) {
        throw new QueryStreamMisuseError(
          'query(): `refetchInterval` cannot be used together with a stream (AsyncIterable) source. Polling and streaming are mutually exclusive.',
        );
      }
      // Streams require an explicit key.
      if (!options.key) {
        throw new QueryStreamMisuseError(
          'query(): a stream (AsyncIterable) source requires an explicit `key` option.',
        );
      }
      streamMode = true;
      firstClassifiedMode = 'stream';
      currentStreamController = probeController;
      untrack(() => {
        rawData.value = [] as unknown as T;
        loading.value = true;
        // Per design Implementation Notes #3: idle flips to false on the first
        // non-null thunk return, NOT on the first yield.  The thunk has now
        // returned a non-null AsyncIterable, so the query is no longer idle.
        idle.value = false;
        reconnecting.value = false;
        error.value = undefined;
      });
      pumpStream(raw as AsyncIterable<unknown>, probeController.signal).catch((err: unknown) => {
        if (probeController.signal.aborted) return;
        error.value = err;
        if (loading.peek()) loading.value = false;
        if (idle.peek()) idle.value = false;
      });
      isFirst = false;
      return;
    }

    // Source-type lock for the non-stream paths: lock on the first classification.
    if (!firstClassifiedMode) {
      firstClassifiedMode = isQueryDescriptor<T, E>(raw) ? 'descriptor' : 'promise';
    }

    // Phase 3: track this thunk-call's controller so dispose() / refetch() can
    // abort the in-flight signal.  Abort the previous controller (if any) so
    // dep-change re-runs cancel stale work.
    if (currentPromiseController && !currentPromiseController.signal.aborted) {
      currentPromiseController.abort(new QueryDisposedReason());
    }
    currentPromiseController = probeController;

    // Classify the result: QueryDescriptor or Promise.
    // MUST check isQueryDescriptor FIRST — QueryDescriptor extends PromiseLike,
    // and accidentally .then()-ing it would trigger a double-fetch.
    let promise: Promise<T>;
    let effectKey: string | undefined;
    let effectEntityMeta: EntityQueryMeta | undefined;

    if (isQueryDescriptor<T, E>(raw)) {
      effectKey = raw._key;
      effectEntityMeta = raw._entity;
      const fetchResult = raw._fetch();
      promise = fetchResult.then((result: Result<T, E>) => {
        if (!result.ok) throw result.error;
        return result.data;
      });
      // Lazy entity metadata setup on first descriptor return
      if (effectEntityMeta && !entityMeta) {
        entityMeta = effectEntityMeta;
        if (!isSSR()) {
          unsubscribeBus = getMutationEventBus().subscribe(entityMeta.entityType, refetch);
          unregisterFromRegistry = registerActiveQuery(
            entityMeta,
            refetch,
            createClearData(entityMeta),
          );
        }
      }
    } else {
      promise = raw as Promise<T>;
    }

    // Mark the query as no longer idle — a fetch is about to start.
    untrack(() => {
      idle.value = false;
    });

    // Snapshot the cache key for this effect run.
    // For descriptor-in-thunk, combine the descriptor's _key with the dep
    // hash so that different reactive deps produce different cache keys —
    // the descriptor's URL may not include all parameters (e.g., when
    // params are in the fetch closure or request body, not the URL).
    // For plain thunks (no descriptor), use the dep-hash-derived key.
    const depHash = untrack(() => depHashSignal.value);
    // Persist effectKey so refetch()/clearData() use the same key format.
    currentEffectKey = effectKey;
    const key = effectKey
      ? depHash
        ? `${effectKey}:${depHash}`
        : effectKey
      : untrack(() => getCacheKey());

    // Deduplication check for derived keys: now that the thunk has been
    // called and the dep hash updated, check if an in-flight request
    // exists for this key.
    if (!customKey && !effectKey) {
      const existing = untrack(() => getInflight().get(key) as Promise<T> | undefined);
      if (existing) {
        promise.catch(() => {});
        const id = ++fetchId;
        untrack(() => {
          if (rawData.value !== undefined) {
            revalidating.value = true;
          } else {
            loading.value = true;
          }
          error.value = undefined;
        });
        handleFetchPromise(existing, id, key);
        isFirst = false;
        return;
      }
    }

    // Cache hit: serve data from cache without re-fetching.
    // - During navigation (ssrHydrationCleanup !== null): always check cache
    //   on first run — cached data from a previous visit should render
    //   immediately (SWR pattern). This covers derived-key queries that
    //   were previously skipped because the key wasn't known until thunk ran.
    // - On first run with a custom key (non-nav): check cache to support
    //   remounting a query still in the shared cache.
    // - On subsequent runs with derived keys: check cache when deps change
    //   back to previously-seen values.
    // - On subsequent runs with custom keys: skip — the key is static, so
    //   a cache hit would prevent re-fetching when deps change.
    const isNavigation = ssrHydrationCleanup !== null;
    const shouldCheckCache = effectKey || isNavigation || (isFirst ? !!customKey : !customKey);
    if (shouldCheckCache) {
      const cached = untrack(() => cache.get(key));
      if (cached !== undefined) {
        retainKey(key);
        promise.catch(() => {});
        untrack(() => {
          normalizeToEntityStore(cached);
          rawData.value = cached;
          loading.value = false;
          error.value = undefined;
        });
        isFirst = false;
        // Start polling if refetchInterval is configured.
        scheduleInterval();
        return;
      }
    }

    if (isFirst && initialData !== undefined) {
      // Skip the initial fetch when initialData is provided.
      // The thunk was still called above to register reactive deps.
      // Suppress unhandled rejection on the discarded tracking promise.
      promise.catch(() => {});
      isFirst = false;
      // Start polling if refetchInterval is configured.
      scheduleInterval();
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

  /**
   * Dispose the query — stops the reactive effect and cleans up inflight state.
   *
   * Declared as a const arrow (not a function declaration) to prevent
   * hoisting.  A hoisted `dispose` could be placed before `unsubscribeBus`
   * / `unregisterFromRegistry` in bundled output, causing TDZ when the
   * bundler tries to inline or scope-hoist this module (#1819).
   */
  const dispose = (): void => {
    // Stream-mode (Phase 2): cancel the active pump first so the abort signal
    // fires before lifecycleEffect tears down (otherwise a producer's abort
    // listener might race with the test runner's exit).
    if (streamMode) {
      cancelStreamPump(new QueryDisposedReason());
    }
    // Phase 3: abort the in-flight promise/descriptor signal too, so signal-
    // aware producers (e.g., fetch with { signal }) can stop wasting work.
    if (currentPromiseController && !currentPromiseController.signal.aborted) {
      currentPromiseController.abort(new QueryDisposedReason());
    }
    // Decrement ref counts for all referenced entities
    if (referencedKeys.size > 0) {
      const store = getEntityStore();
      for (const key of referencedKeys) {
        const [type, id] = splitRefKey(key);
        store.removeRef(type, id);
      }
      referencedKeys.clear();
    }
    // Release cache key so it becomes orphaned for eviction priority.
    releaseCurrentKey();
    // Dispose the reactive effect to stop re-running on dep changes.
    disposeFn?.();
    // Unsubscribe from mutation event bus.
    unsubscribeBus?.();
    // Unregister from active query registry (invalidate() lookups).
    unregisterFromRegistry?.();
    // Clean up SSR hydration listener if still active.
    ssrHydrationCleanup?.();
    // Clear any pending debounce or interval timer.
    clearTimeout(debounceTimer);
    clearTimeout(intervalTimer);
    // Remove visibility listener.
    if (visibilityHandler && isBrowser()) {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    // Invalidate any pending fetch responses by bumping fetchId.
    fetchId++;
    // Clean up ALL in-flight entries for this query instance, not just the
    // current version. Without this, old versioned keys (v0, v1, ...) would
    // leak in the global inflight map if the query is disposed while multiple
    // fetches are still pending (BLOCKING 2 fix).
    for (const key of inflightKeys) {
      getInflight().delete(key);
    }
    inflightKeys.clear();
  };

  /**
   * Create a clearData callback for tenant-switch invalidation.
   * Resets the query to a "no data / loading" state before refetch,
   * preventing stale cross-tenant data from being visible.
   */
  function createClearData(meta: EntityQueryMeta): () => void {
    return () => {
      untrack(() => {
        entityBacked.value = false;
        rawData.value = undefined;
        loading.value = true;
      });
      // Use the same key format as the effect path for cache deletion (#1891).
      const cacheKey = untrack(() => resolveCurrentCacheKey());
      cache.delete(cacheKey);
      // queryIndices and envelopeStore are keyed by entity type or custom key.
      const queryKey = customKey ?? meta.entityType;
      getEntityStore().queryIndices.clear(queryKey);
      getQueryEnvelopeStore().delete(queryKey);
    };
  }

  // Subscribe to MutationEventBus for same-type revalidation.
  // When a mutation commits for this entity type, revalidate the query.
  // Skip during SSR — mutations don't fire server-side, and subscriptions
  // would leak until the bus is reset between requests.
  // Guard with !unsubscribeBus: the lazy entity-metadata path inside
  // lifecycleEffect may have already subscribed (#1819).
  if (entityMeta && !isSSR() && !unsubscribeBus) {
    unsubscribeBus = getMutationEventBus().subscribe(entityMeta.entityType, refetch);
    unregisterFromRegistry = registerActiveQuery(entityMeta, refetch, createClearData(entityMeta));
  }

  // Auto-register disposal with the current scope (component/page/app).
  // If no scope is active (standalone usage), this is a silent no-op.
  _tryOnCleanup(dispose);

  // Stream-mode return — different shape (data: T[], reconnecting instead of revalidating).
  // streamMode is set inside the effect's first run, which runs synchronously
  // when lifecycleEffect installs, so by this point classification is settled.
  if (streamMode) {
    return {
      data: rawData as unknown as Unwrapped<ReadonlySignal<T[]>>,
      loading: loading as unknown as Unwrapped<ReadonlySignal<boolean>>,
      reconnecting: reconnecting as unknown as Unwrapped<ReadonlySignal<boolean>>,
      error: error as unknown as Unwrapped<ReadonlySignal<unknown>>,
      idle: idle as unknown as Unwrapped<ReadonlySignal<boolean>>,
      refetch,
      revalidate: refetch,
      dispose,
    } satisfies QueryStreamResult<T>;
  }

  // Return signals with type casts to match the unwrapped return types
  return {
    data: data as unknown as Unwrapped<ReadonlySignal<T | undefined>>,
    loading: loading as unknown as Unwrapped<ReadonlySignal<boolean>>,
    revalidating: revalidating as unknown as Unwrapped<ReadonlySignal<boolean>>,
    error: error as unknown as Unwrapped<ReadonlySignal<E | undefined>>,
    idle: idle as unknown as Unwrapped<ReadonlySignal<boolean>>,
    refetch,
    revalidate: refetch,
    dispose,
  };
}

/**
 * Diff old and new ref key sets — increment/decrement ref counts accordingly.
 */
function updateRefCounts(store: EntityStoreType, oldKeys: Set<string>, newKeys: Set<string>): void {
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      const [type, id] = splitRefKey(key);
      store.removeRef(type, id);
    }
  }
  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      const [type, id] = splitRefKey(key);
      store.addRef(type, id);
    }
  }
  oldKeys.clear();
  for (const key of newKeys) oldKeys.add(key);
}

function splitRefKey(key: string): [string, string] {
  const idx = key.indexOf(':');
  return [key.slice(0, idx), key.slice(idx + 1)];
}
