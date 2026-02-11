/**
 * SELECT statement builder.
 *
 * Generates parameterized SELECT queries with support for:
 * - Column selection with camelCase -> snake_case conversion and aliasing
 * - WHERE clause via the where builder
 * - ORDER BY with direction
 * - LIMIT / OFFSET pagination (parameterized)
 * - COUNT(*) OVER() for findManyAndCount
 */

import { camelToSnake } from './casing';
import { buildWhere, type WhereResult } from './where';

export interface SelectOptions {
  readonly table: string;
  readonly columns?: readonly string[];
  readonly where?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
  readonly withCount?: boolean;
}

export interface SelectResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Build a column reference with optional alias.
 *
 * If the camelCase name differs from its snake_case equivalent,
 * generates `"snake_name" AS "camelName"` for automatic casing.
 */
function buildColumnRef(name: string): string {
  const snakeName = camelToSnake(name);
  if (snakeName === name) {
    return `"${name}"`;
  }
  return `"${snakeName}" AS "${name}"`;
}

/**
 * Build a SELECT statement from the given options.
 */
export function buildSelect(options: SelectOptions): SelectResult {
  const parts: string[] = [];
  const allParams: unknown[] = [];

  // SELECT columns
  let columnList: string;
  if (options.columns && options.columns.length > 0) {
    columnList = options.columns.map(buildColumnRef).join(', ');
  } else {
    columnList = '*';
  }

  if (options.withCount) {
    columnList += ', COUNT(*) OVER() AS "totalCount"';
  }

  parts.push(`SELECT ${columnList} FROM "${options.table}"`);

  // WHERE
  if (options.where) {
    const whereResult: WhereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      parts.push(`WHERE ${whereResult.sql}`);
      allParams.push(...whereResult.params);
    }
  }

  // ORDER BY
  if (options.orderBy) {
    const orderClauses = Object.entries(options.orderBy).map(
      ([col, dir]) => `"${camelToSnake(col)}" ${dir.toUpperCase()}`,
    );
    if (orderClauses.length > 0) {
      parts.push(`ORDER BY ${orderClauses.join(', ')}`);
    }
  }

  // LIMIT (parameterized)
  if (options.limit !== undefined) {
    allParams.push(options.limit);
    parts.push(`LIMIT $${allParams.length}`);
  }

  // OFFSET (parameterized)
  if (options.offset !== undefined) {
    allParams.push(options.offset);
    parts.push(`OFFSET $${allParams.length}`);
  }

  return {
    sql: parts.join(' '),
    params: allParams,
  };
}
