/**
 * Result type and utilities for errors-as-values pattern.
 *
 * This module re-exports from @vertz/errors for convenience.
 * Every operation that can fail returns a Result<T, E> instead of throwing.
 *
 * @example
 * import { ok, err, unwrap, map, flatMap, match, matchErr } from '@vertz/schema';
 *
 * // Creating results
 * const success = ok({ name: 'Alice' });
 * const failure = err({ code: 'NOT_FOUND', message: 'User not found' });
 *
 * // Transforming
 * const doubled = map(ok(5), x => x * 2);
 *
 * // Chaining
 * const result = await flatMap(ok(5), async x => ok(x * 2));
 *
 * // Pattern matching
 * const message = match(result, {
 *   ok: (data) => `Success: ${data}`,
 *   err: (error) => `Error: ${error.message}`
 * });
 */

export type { Result, Ok, Err } from '@vertz/errors';
export {
  ok,
  err,
  unwrap,
  unwrapOr,
  map,
  flatMap,
  match,
  matchErr,
  isOk,
  isErr,
} from '@vertz/errors';
