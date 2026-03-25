import type { FetchError, Result } from '@vertz/errors';
import { ok } from '@vertz/errors';
import type { EntityQueryMeta, FetchResponse, MutationMeta, OptimisticHandler } from './types';

export interface QueryDescriptor<T, E = FetchError> extends PromiseLike<Result<T, E>> {
  readonly _tag: 'QueryDescriptor';
  readonly _key: string;
  readonly _fetch: () => Promise<Result<T, E>>;
  /** Entity metadata for entity-backed queries. */
  readonly _entity?: EntityQueryMeta;
  /** Phantom field to carry the error type through generics. Never set at runtime. */
  readonly _error?: E;
}

export interface MutationDescriptor<T, E = FetchError> extends PromiseLike<Result<T, E>> {
  readonly _tag: 'MutationDescriptor';
  readonly _key: string;
  readonly _fetch: () => Promise<Result<T, E>>;
  readonly _mutation: MutationMeta;
  /** Phantom field to carry the error type through generics. Never set at runtime. */
  readonly _error?: E;
}

export function isQueryDescriptor<T, E = FetchError>(
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
  entity?: EntityQueryMeta,
): QueryDescriptor<T> {
  const key = `${method}:${path}${serializeQuery(query)}`;

  const fetchResult = async (): Promise<Result<T, FetchError>> => {
    const response = await fetchFn();
    if (!response.ok) return response;
    return ok(response.data.data);
  };

  return {
    _tag: 'QueryDescriptor' as const,
    _key: key,
    _fetch: fetchResult,
    ...(entity ? { _entity: entity } : {}),

    then(onFulfilled, onRejected) {
      return fetchResult().then(onFulfilled, onRejected);
    },
  };
}

export function isMutationDescriptor<T, E = FetchError>(
  value: unknown,
): value is MutationDescriptor<T, E> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_tag' in value &&
    (value as Record<string, unknown>)._tag === 'MutationDescriptor'
  );
}

export function createMutationDescriptor<T>(
  method: string,
  path: string,
  fetchFn: () => Promise<FetchResponse<T>>,
  mutation: MutationMeta,
  handler?: OptimisticHandler,
): MutationDescriptor<T> {
  const key = `${method}:${path}`;
  let mutationCounter = 0;

  const fetchResult = async (): Promise<Result<T, FetchError>> => {
    const response = await fetchFn();
    if (!response.ok) return response;
    return ok(response.data.data);
  };

  return {
    _tag: 'MutationDescriptor' as const,
    _key: key,
    _mutation: mutation,
    _fetch: fetchResult,

    then(onFulfilled, onRejected) {
      const id = `m_${++mutationCounter}_${Date.now().toString(36)}`;

      // 1. Apply optimistic update (synchronous)
      const rollback = handler?.apply(mutation, id);

      // 2. Execute fetch
      return fetchResult().then(
        (result) => {
          if (result.ok) {
            handler?.commit(mutation, id, result.data);
          } else {
            rollback?.();
          }
          return onFulfilled?.(result) ?? (result as never);
        },
        (err) => {
          rollback?.();
          if (onRejected) return onRejected(err);
          throw err;
        },
      );
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
