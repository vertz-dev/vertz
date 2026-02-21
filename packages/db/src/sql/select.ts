/**
 * SELECT statement builder.
 *
 * Generates parameterized SELECT queries with support for:
 * - Column selection with camelCase -> snake_case conversion and aliasing
 * - WHERE clause via the where builder
 * - ORDER BY with direction
 * - LIMIT / OFFSET pagination (parameterized)
 * - Cursor-based pagination (cursor + take)
 * - COUNT(*) OVER() for listAndCount
 */

import { type CasingOverrides, camelToSnake } from './casing';
import { type Dialect, defaultPostgresDialect } from '../dialect';
import { buildWhere, type WhereResult } from './where';

export interface SelectOptions {
  readonly table: string;
  readonly columns?: readonly string[];
  readonly where?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
  readonly withCount?: boolean;
  /** Cursor object: column-value pairs marking the position to paginate from. */
  readonly cursor?: Record<string, unknown>;
  /** Number of rows to take (used with cursor). Aliases `limit` when cursor is present. */
  readonly take?: number;
  /** Custom casing overrides for camelCase -> snake_case conversion. */
  readonly casingOverrides?: CasingOverrides;
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
function buildColumnRef(name: string, casingOverrides?: CasingOverrides): string {
  const snakeName = camelToSnake(name, casingOverrides);
  if (snakeName === name) {
    return `"${name}"`;
  }
  return `"${snakeName}" AS "${name}"`;
}

/**
 * Build a SELECT statement from the given options.
 */
export function buildSelect(
  options: SelectOptions,
  dialect: Dialect = defaultPostgresDialect,
): SelectResult {
  const parts: string[] = [];
  const allParams: unknown[] = [];
  const { casingOverrides } = options;

  // SELECT columns
  let columnList: string;
  if (options.columns && options.columns.length > 0) {
    columnList = options.columns.map((col) => buildColumnRef(col, casingOverrides)).join(', ');
  } else {
    columnList = '*';
  }

  if (options.withCount) {
    columnList += ', COUNT(*) OVER() AS "totalCount"';
  }

  parts.push(`SELECT ${columnList} FROM "${options.table}"`);

  // WHERE
  const whereClauses: string[] = [];

  if (options.where) {
    const whereResult: WhereResult = buildWhere(options.where, 0, casingOverrides, dialect);
    if (whereResult.sql.length > 0) {
      whereClauses.push(whereResult.sql);
      allParams.push(...whereResult.params);
    }
  }

  // Cursor-based pagination: add cursor WHERE conditions
  if (options.cursor) {
    const cursorEntries = Object.entries(options.cursor);
    if (cursorEntries.length === 1) {
      // Single-column cursor: simple comparison
      const [col, value] = cursorEntries[0] as [string, unknown];
      const snakeCol = camelToSnake(col, casingOverrides);
      // Determine direction from orderBy or default to 'asc'
      const dir = options.orderBy?.[col] ?? 'asc';
      const op = dir === 'desc' ? '<' : '>';
      allParams.push(value);
      whereClauses.push(`"${snakeCol}" ${op} ${dialect.param(allParams.length)}`);
    } else if (cursorEntries.length > 1) {
      // Composite cursor: row-value comparison (col1, col2, ...) > ($N, $N+1, ...)
      const cols: string[] = [];
      const placeholders: string[] = [];
      // Determine composite direction from first cursor column's orderBy or default to 'asc'
      const firstCol = cursorEntries[0]?.[0] ?? '';
      const dir = options.orderBy?.[firstCol] ?? 'asc';
      const op = dir === 'desc' ? '<' : '>';
      for (const [col, value] of cursorEntries) {
        cols.push(`"${camelToSnake(col, casingOverrides)}"`);
        allParams.push(value);
        placeholders.push(dialect.param(allParams.length));
      }
      whereClauses.push(`(${cols.join(', ')}) ${op} (${placeholders.join(', ')})`);
    }
  }

  if (whereClauses.length > 0) {
    parts.push(`WHERE ${whereClauses.join(' AND ')}`);
  }

  // ORDER BY — explicit orderBy takes precedence; cursor columns used as fallback
  if (options.orderBy) {
    const orderClauses = Object.entries(options.orderBy).map(
      ([col, dir]) => `"${camelToSnake(col, casingOverrides)}" ${dir.toUpperCase()}`,
    );
    if (orderClauses.length > 0) {
      parts.push(`ORDER BY ${orderClauses.join(', ')}`);
    }
  } else if (options.cursor) {
    // Derive ORDER BY from cursor columns (default ASC)
    const orderClauses = Object.keys(options.cursor).map(
      (col) => `"${camelToSnake(col, casingOverrides)}" ASC`,
    );
    if (orderClauses.length > 0) {
      parts.push(`ORDER BY ${orderClauses.join(', ')}`);
    }
  }

  // LIMIT — `take` is an alias for `limit` when cursor is present
  const effectiveLimit = options.take ?? options.limit;
  if (effectiveLimit !== undefined) {
    allParams.push(effectiveLimit);
    parts.push(`LIMIT ${dialect.param(allParams.length)}`);
  }

  // OFFSET (parameterized)
  if (options.offset !== undefined) {
    allParams.push(options.offset);
    parts.push(`OFFSET ${dialect.param(allParams.length)}`);
  }

  return {
    sql: parts.join(' '),
    params: allParams,
  };
}
