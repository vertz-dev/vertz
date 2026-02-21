/**
 * DELETE statement builder.
 *
 * Generates parameterized DELETE queries with support for:
 * - WHERE clause via the where builder
 * - RETURNING clause with column aliasing
 * - camelCase -> snake_case column conversion
 */

import { type Dialect, defaultPostgresDialect } from '../dialect';
import { camelToSnake } from './casing';
import { buildWhere } from './where';

export interface DeleteOptions {
  readonly table: string;
  readonly where?: Record<string, unknown>;
  readonly returning?: '*' | readonly string[];
  /** SQL dialect to use. Defaults to postgres. */
  readonly dialect?: Dialect;
}

export interface DeleteResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Build a column reference for RETURNING with optional alias.
 */
function buildReturningColumnRef(name: string): string {
  const snakeName = camelToSnake(name);
  if (snakeName === name) {
    return `"${name}"`;
  }
  return `"${snakeName}" AS "${name}"`;
}

/**
 * Build a DELETE statement from the given options.
 */
export function buildDelete(
  options: DeleteOptions,
  dialect: Dialect = defaultPostgresDialect,
): DeleteResult {
  const allParams: unknown[] = [];
  let sql = `DELETE FROM "${options.table}"`;

  // WHERE
  if (options.where) {
    const whereResult = buildWhere(options.where, 0, undefined, dialect);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }

  // RETURNING
  if (options.returning) {
    if (options.returning === '*') {
      sql += ' RETURNING *';
    } else {
      const returnCols = options.returning.map(buildReturningColumnRef).join(', ');
      sql += ` RETURNING ${returnCols}`;
    }
  }

  return { sql, params: allParams };
}
