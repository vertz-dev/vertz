/**
 * Update expressions for column-relative SQL operations.
 *
 * `DbExpr` represents a SQL expression that references the current column value.
 * Used in `update()`, `updateMany()`, and `upsert()` to express atomic operations
 * like increment, decrement, or arbitrary SQL functions without dropping to raw SQL.
 *
 * @example
 * ```ts
 * import { d, sql } from '@vertz/db';
 *
 * // Atomic increment
 * db.urls.update({
 *   where: { id },
 *   data: { clickCount: d.increment(1) },
 * });
 *
 * // Arbitrary SQL expression
 * db.urls.update({
 *   where: { id },
 *   data: { slug: d.expr((col) => sql`UPPER(${col})`) },
 * });
 * ```
 */

import type { SqlFragment } from './tagged';

/**
 * A column-relative SQL expression.
 *
 * The `build` callback receives a `SqlFragment` representing the quoted column
 * reference and must return a `SqlFragment` for the full SET expression value.
 */
export interface DbExpr {
  readonly _tag: 'DbExpr';
  readonly build: (columnRef: SqlFragment) => SqlFragment;
}

/**
 * Type guard for `DbExpr` values.
 */
export function isDbExpr(value: unknown): value is DbExpr {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    (value as DbExpr)._tag === 'DbExpr'
  );
}
