import type { Signal } from '../runtime/signal-types';
import type { QueryResult } from './query';

export interface QueryMatchHandlers<T, E, L, Er, D> {
  loading: () => L;
  error: (error: E) => Er;
  data: (data: T, revalidating: boolean) => D;
}

/**
 * Pattern-match on a QueryResult's exclusive state.
 *
 * Reads .value from the underlying signals to subscribe the enclosing
 * computed/effect to the query's reactive graph. Exactly one handler
 * runs per evaluation.
 *
 * Priority: loading → error → data.
 *
 * `loading` only fires on the initial load (no data yet).
 * When revalidating with existing data, the `data` handler receives
 * `revalidating: true` as its second argument.
 */
export function queryMatch<T, E, L, Er, D>(
  queryResult: QueryResult<T, E>,
  handlers: QueryMatchHandlers<T, E, L, Er, D>,
): L | Er | D {
  // At runtime, QueryResult properties are Signal objects with .value,
  // even though the TypeScript type erases .value via Unwrapped<>.
  // Reading .value subscribes the enclosing computed/effect to changes.
  if ((queryResult.loading as unknown as Signal<boolean>).value) {
    return handlers.loading();
  }
  const err = (queryResult.error as unknown as Signal<E | undefined>).value;
  if (err !== undefined) {
    return handlers.error(err);
  }
  const isRevalidating = (queryResult.revalidating as unknown as Signal<boolean>).value;
  return handlers.data(
    (queryResult.data as unknown as Signal<T | undefined>).value as T,
    isRevalidating,
  );
}
