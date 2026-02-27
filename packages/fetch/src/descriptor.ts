import type { FetchResponse } from './types';

/** Extract the error type from a FetchResponse. */
type FetchResponseError<T> = FetchResponse<T> extends { ok: false; error: infer E } ? E : never;

/** The default error type for QueryDescriptor — derived from FetchResponse. */
type DefaultFetchError = FetchResponseError<unknown>;

export interface QueryDescriptor<T, E = DefaultFetchError> extends PromiseLike<T> {
  readonly _tag: 'QueryDescriptor';
  readonly _key: string;
  readonly _fetch: () => Promise<T>;
  /** Phantom field to carry the error type through generics. Never set at runtime. */
  readonly _error?: E;
}

export function isQueryDescriptor<T, E = DefaultFetchError>(
  value: unknown,
): value is QueryDescriptor<T, E> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_tag' in value &&
    (value as Record<string, unknown>)._tag === 'QueryDescriptor'
  );
}

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
    _tag: 'QueryDescriptor' as const,
    _key: key,
    _fetch: unwrappedFetch,
    // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation
    then(onFulfilled, onRejected) {
      return unwrappedFetch().then(onFulfilled, onRejected);
    },
  };
}

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
