import type { FetchResponse } from './types';

export interface QueryDescriptor<T> extends PromiseLike<T> {
  readonly _tag: 'QueryDescriptor';
  readonly _key: string;
  readonly _fetch: () => Promise<T>;
}

export function isQueryDescriptor<T>(value: unknown): value is QueryDescriptor<T> {
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
