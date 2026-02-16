import type { ReadonlySignal } from '../runtime/signal-types';
import { type CacheStore } from './cache';
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
 * Exposed for testing — returns the current size of the in-flight registry.
 * @internal
 */
export declare function __inflightSize(): number;
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
export declare function query<T>(
  thunk: () => Promise<T>,
  options?: QueryOptions<T>,
): QueryResult<T>;
//# sourceMappingURL=query.d.ts.map
