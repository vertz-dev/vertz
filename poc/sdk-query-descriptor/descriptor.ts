/**
 * POC: QueryDescriptor — thenable with metadata for SDK + query() integration.
 *
 * Validates:
 * 1. QueryDescriptor<T> is a PromiseLike (await resolves to T)
 * 2. TypeScript infers T through query() overloads
 * 3. Auto-key derivation from HTTP method + path
 * 4. Result auto-unwrap (ok → data, err → throw)
 */

// ---------- Simulated framework types (from @vertz/errors + @vertz/fetch) ----------

interface Ok<T> {
  readonly ok: true;
  readonly data: T;
}

interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

type Result<T, E = unknown> = Ok<T> | Err<E>;

interface FetchError {
  readonly code: string;
  readonly message: string;
}

type FetchResponse<T> = Result<{ data: T; status: number; headers: Headers }, FetchError>;

// ---------- QueryDescriptor ----------

export interface QueryDescriptor<T> extends PromiseLike<T> {
  /** Cache key derived from HTTP method + path. */
  readonly _key: string;
  /** The fetch function that returns the unwrapped data. */
  readonly _fetch: () => Promise<T>;
}

/**
 * Type guard to distinguish QueryDescriptor from plain thunks in query() overloads.
 */
export function isQueryDescriptor<T>(value: unknown): value is QueryDescriptor<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_key' in value &&
    '_fetch' in value &&
    'then' in value
  );
}

/**
 * Serialize query params into a stable, sorted string for cache key inclusion.
 */
function serializeQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Create a QueryDescriptor that:
 * - Carries a cache key derived from method + path
 * - Is thenable (await resolves to T, not the descriptor)
 * - Auto-unwraps the Result<FetchResponse<T>> chain
 */
export function createDescriptor<T>(
  method: string,
  path: string,
  fetchFn: () => Promise<FetchResponse<T>>,
  query?: Record<string, unknown>,
): QueryDescriptor<T> {
  const key = `${method}:${path}${serializeQuery(query)}`;

  const unwrappedFetch = async (): Promise<T> => {
    const result = await fetchFn();
    if (!result.ok) throw result.error;
    return result.data.data;
  };

  return {
    _key: key,
    _fetch: unwrappedFetch,
    then<TResult1 = T, TResult2 = never>(
      onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return unwrappedFetch().then(onFulfilled, onRejected);
    },
  };
}

// ---------- query() overloads ----------

/** Reactive query result (simulated — real one uses signals). */
export interface QueryResult<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly _key: string;
}

export interface QueryOptions<T> {
  initialData?: T;
  enabled?: boolean;
  key?: string;
}

/**
 * Overload 1: query(descriptor, options?)
 * Accepts a QueryDescriptor — auto-derives key, no key option needed.
 */
export function query<T>(
  descriptor: QueryDescriptor<T>,
  options?: Omit<QueryOptions<T>, 'key'>,
): QueryResult<T>;

/**
 * Overload 2: query(thunk, options?)
 * Accepts a plain async function — backward compatible.
 */
export function query<T>(
  thunk: () => Promise<T>,
  options?: QueryOptions<T>,
): QueryResult<T>;

// Implementation
export function query<T>(
  source: QueryDescriptor<T> | (() => Promise<T>),
  options?: QueryOptions<T>,
): QueryResult<T> {
  if (isQueryDescriptor<T>(source)) {
    // Descriptor path: auto-key, auto-unwrap
    const key = source._key;
    // In real implementation, this would set up reactive signals.
    // For POC, we just validate the type flow works.
    return {
      data: options?.initialData,
      loading: options?.enabled !== false,
      error: undefined,
      _key: key,
    };
  }

  // Thunk path: backward compatible
  return {
    data: options?.initialData,
    loading: options?.enabled !== false,
    error: undefined,
    _key: options?.key ?? 'derived-from-thunk',
  };
}
