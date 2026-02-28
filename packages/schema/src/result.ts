/**
 * Result type and utilities for errors-as-values pattern.
 *
 * This module re-exports Result type and utilities from @vertz/errors.
 * This provides backward compatibility for existing imports from @vertz/schema.
 *
 * @example
 * import { ok, err, unwrap, map, flatMap, match, matchErr } from '@vertz/schema';
 *
 * // Creating results
 * const success = ok({ name: 'Alice' });
 * const failure = err(new Error('validation failed'));
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

// Re-export all Result types and utilities from @vertz/errors
export type { Err, Ok, Result } from '@vertz/errors';
export {
  err,
  flatMap,
  isErr,
  isOk,
  map,
  match,
  matchErr,
  ok,
  unwrap,
  unwrapOr,
} from '@vertz/errors';
