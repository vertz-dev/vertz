/**
 * Aggregation queries — DB-012.
 *
 * Implements count, aggregate, and groupBy methods.
 * Generates parameterized SQL for aggregation functions.
 */

import type { InferColumnType } from '../schema/column';
import type { FilterType, ModelEntry, NumericColumnKeys } from '../schema/inference';
import type { ColumnRecord, TableDef } from '../schema/table';
import { camelToSnake } from '../sql/casing';
import { buildWhere } from '../sql/where';
import type { QueryFn } from './executor';
import { executeQuery } from './executor';
import type { GroupByExpression } from './expression';
import { isGroupByExpression } from './expression';

// ---------------------------------------------------------------------------
// count
// ---------------------------------------------------------------------------

export interface CountArgs {
  readonly where?: Record<string, unknown>;
}

/**
 * Count rows matching an optional filter.
 */
export async function count(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: CountArgs,
): Promise<number> {
  const allParams: unknown[] = [];
  let sql = `SELECT COUNT(*) AS "count" FROM "${table._name}"`;

  if (options?.where) {
    const whereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }

  const res = await executeQuery<Record<string, unknown>>(queryFn, sql, allParams);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

export interface AggregateArgs {
  readonly where?: Record<string, unknown>;
  readonly _avg?: Record<string, true>;
  readonly _sum?: Record<string, true>;
  readonly _min?: Record<string, true>;
  readonly _max?: Record<string, true>;
  readonly _count?: true | Record<string, true>;
}

/**
 * Run aggregation functions on a table.
 */
export async function aggregate(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: AggregateArgs,
): Promise<Record<string, unknown>> {
  const selectParts: string[] = [];
  const aggFunctions: Array<{ fn: string; columns: string[] | null; key: string }> = [];

  if (options._count !== undefined) {
    if (options._count === true) {
      selectParts.push('COUNT(*) AS "_count"');
      aggFunctions.push({ fn: 'count', columns: null, key: '_count' });
    } else {
      for (const col of Object.keys(options._count)) {
        const snakeCol = camelToSnake(col);
        selectParts.push(`COUNT("${snakeCol}") AS "_count_${snakeCol}"`);
      }
    }
  }

  for (const [fn, aggOpt] of [
    ['AVG', options._avg],
    ['SUM', options._sum],
    ['MIN', options._min],
    ['MAX', options._max],
  ] as const) {
    if (!aggOpt) continue;
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const alias = `_${fn.toLowerCase()}_${snakeCol}`;
      selectParts.push(`${fn}("${snakeCol}") AS "${alias}"`);
    }
  }

  if (selectParts.length === 0) {
    return {};
  }

  const allParams: unknown[] = [];
  let sql = `SELECT ${selectParts.join(', ')} FROM "${table._name}"`;

  if (options.where) {
    const whereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }

  const res = await executeQuery<Record<string, unknown>>(queryFn, sql, allParams);
  const row = res.rows[0] as Record<string, unknown> | undefined;

  if (!row) return {};

  // Restructure the flat row into nested result
  const result: Record<string, unknown> = {};

  if (options._count !== undefined) {
    if (options._count === true) {
      result._count = Number(row._count ?? 0);
    } else {
      const countObj: Record<string, number> = {};
      for (const col of Object.keys(options._count)) {
        const snakeCol = camelToSnake(col);
        countObj[col] = Number(row[`_count_${snakeCol}`] ?? 0);
      }
      result._count = countObj;
    }
  }

  for (const [fn, aggOpt] of [
    ['avg', options._avg],
    ['sum', options._sum],
  ] as const) {
    if (!aggOpt) continue;
    const fnObj: Record<string, number | null> = {};
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const val = row[`_${fn}_${snakeCol}`];
      fnObj[col] = val === null || val === undefined ? null : Number(val);
    }
    result[`_${fn}`] = fnObj;
  }

  // _min/_max preserve the original column type (string, Date, number, etc.)
  for (const [fn, aggOpt] of [
    ['min', options._min],
    ['max', options._max],
  ] as const) {
    if (!aggOpt) continue;
    const fnObj: Record<string, unknown> = {};
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const val = row[`_${fn}_${snakeCol}`];
      fnObj[col] = val === null || val === undefined ? null : val;
    }
    result[`_${fn}`] = fnObj;
  }

  return result;
}

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------

export interface GroupByArgs {
  readonly by: readonly (string | GroupByExpression)[];
  readonly where?: Record<string, unknown>;
  readonly _count?: true | Record<string, true>;
  readonly _avg?: Record<string, true>;
  readonly _sum?: Record<string, true>;
  readonly _min?: Record<string, true>;
  readonly _max?: Record<string, true>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
}

// ---------------------------------------------------------------------------
// TypedAggregateArgs — strongly typed version for ModelDelegate
// ---------------------------------------------------------------------------

/** Helper to extract columns from a ModelEntry. */
type EntryColumns<TEntry extends ModelEntry> = TEntry['table']['_columns'];

/**
 * Strongly typed aggregate arguments, parameterized by the model's columns.
 *
 * - `where` uses FilterType for typed filter operators.
 * - `_avg` and `_sum` are restricted to numeric columns.
 * - `_min`, `_max`, `_count` accept any column.
 */
export type TypedAggregateArgs<TEntry extends ModelEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly _avg?: { readonly [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true };
  readonly _sum?: { readonly [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true };
  readonly _min?: { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly _max?: { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly _count?: true | { readonly [K in keyof EntryColumns<TEntry>]?: true };
};

// ---------------------------------------------------------------------------
// AggregateResult — compute return type from requested fields
// ---------------------------------------------------------------------------

/** Flatten intersections for clean IntelliSense tooltips. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Map requested columns to number | null (for _avg/_sum). */
type NumericAggColumns<TArgs> =
  TArgs extends Record<string, true> ? { [K in keyof TArgs]: number | null } : never;

/** Map requested columns to their inferred type | null (for _min/_max). */
type TypedAggColumns<TColumns extends ColumnRecord, TArgs> =
  TArgs extends Record<string, true>
    ? { [K in keyof TArgs & keyof TColumns]: InferColumnType<TColumns[K]> | null }
    : never;

/** Map requested columns to number (for per-column _count). */
type CountColumns<TArgs> =
  TArgs extends Record<string, true> ? { [K in keyof TArgs]: number } : never;

/**
 * Compute the aggregate result shape from the columns and the requested args.
 *
 * - `_avg`/`_sum` → `{ [col]: number | null }` (always numeric)
 * - `_min`/`_max` → `{ [col]: InferColumnType<col> | null }` (preserves column type)
 * - `_count: true` → `number`
 * - `_count: { col: true }` → `{ [col]: number }`
 */
export type AggregateResult<TColumns extends ColumnRecord, TArgs> = Prettify<
  ('_avg' extends keyof TArgs ? { _avg: NumericAggColumns<TArgs[keyof TArgs & '_avg']> } : {}) &
    ('_sum' extends keyof TArgs ? { _sum: NumericAggColumns<TArgs[keyof TArgs & '_sum']> } : {}) &
    ('_min' extends keyof TArgs
      ? { _min: TypedAggColumns<TColumns, TArgs[keyof TArgs & '_min']> }
      : {}) &
    ('_max' extends keyof TArgs
      ? { _max: TypedAggColumns<TColumns, TArgs[keyof TArgs & '_max']> }
      : {}) &
    ('_count' extends keyof TArgs
      ? TArgs[keyof TArgs & '_count'] extends true
        ? { _count: number }
        : { _count: CountColumns<TArgs[keyof TArgs & '_count']> }
      : {})
>;

// ---------------------------------------------------------------------------
// GroupByResult — compute per-row return type from requested fields
// ---------------------------------------------------------------------------

/** Extract string column names from the `by` tuple. Non-string entries (GroupByExpression) are excluded. */
type ExtractByStringColumns<TBy extends readonly unknown[]> = TBy[number] extends infer Item
  ? Item extends string
    ? Item
    : never
  : never;

/** Check if the `by` tuple contains any non-string entries (GroupByExpression). */
type HasExpressionInBy<TBy extends readonly unknown[]> = TBy[number] extends string ? false : true;

/**
 * Compute the groupBy result row shape from the columns and the requested args.
 *
 * - String columns in `by` → typed with `InferColumnType<col>`
 * - Aggregation fields → same as `AggregateResult`
 * - Expression entries in `by` → `Record<string, unknown>` fallback (aliases are dynamic)
 */
export type GroupByResult<TColumns extends ColumnRecord, TArgs> = Prettify<
  // Group-by string columns
  ('by' extends keyof TArgs
    ? TArgs[keyof TArgs & 'by'] extends readonly unknown[]
      ? {
          [K in ExtractByStringColumns<TArgs[keyof TArgs & 'by']> &
            keyof TColumns]: InferColumnType<TColumns[K]>;
        }
      : {}
    : {}) &
    // Aggregation fields (reuse same logic as AggregateResult)
    ('_avg' extends keyof TArgs ? { _avg: NumericAggColumns<TArgs[keyof TArgs & '_avg']> } : {}) &
    ('_sum' extends keyof TArgs ? { _sum: NumericAggColumns<TArgs[keyof TArgs & '_sum']> } : {}) &
    ('_min' extends keyof TArgs
      ? { _min: TypedAggColumns<TColumns, TArgs[keyof TArgs & '_min']> }
      : {}) &
    ('_max' extends keyof TArgs
      ? { _max: TypedAggColumns<TColumns, TArgs[keyof TArgs & '_max']> }
      : {}) &
    ('_count' extends keyof TArgs
      ? TArgs[keyof TArgs & '_count'] extends true
        ? { _count: number }
        : { _count: CountColumns<TArgs[keyof TArgs & '_count']> }
      : {}) &
    // Expression fallback — if by contains non-string entries, add index signature
    ('by' extends keyof TArgs
      ? TArgs[keyof TArgs & 'by'] extends readonly unknown[]
        ? HasExpressionInBy<TArgs[keyof TArgs & 'by']> extends true
          ? Record<string, unknown>
          : {}
        : {}
      : {})
>;

// ---------------------------------------------------------------------------
// TypedGroupByArgs — strongly typed version for ModelDelegate
// ---------------------------------------------------------------------------

/**
 * Strongly typed groupBy arguments, parameterized by the model's columns.
 *
 * - `by` validates column names and expression column params against the model.
 * - `where` uses FilterType for typed filter operators.
 * - `_avg` and `_sum` are restricted to numeric columns.
 * - `_min`, `_max`, `_count` accept any column.
 */
export type TypedGroupByArgs<TEntry extends ModelEntry> = {
  readonly by: readonly (
    | (keyof EntryColumns<TEntry> & string)
    | GroupByExpression<keyof EntryColumns<TEntry> & string>
  )[];
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly _count?: true | { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly _avg?: { readonly [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true };
  readonly _sum?: { readonly [K in NumericColumnKeys<EntryColumns<TEntry>>]?: true };
  readonly _min?: { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly _max?: { readonly [K in keyof EntryColumns<TEntry>]?: true };
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Group rows by columns and apply aggregation functions.
 */
export async function groupBy(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: GroupByArgs,
  dialect?: { readonly name: string },
): Promise<Record<string, unknown>[]> {
  const selectParts: string[] = [];
  const groupCols: string[] = [];

  // Track aliases for collision detection and orderBy resolution
  const allAliases = new Set<string>();
  const exprAliasToSql = new Map<string, string>();

  // Add group-by columns and expressions
  for (const item of options.by) {
    if (isGroupByExpression(item)) {
      const expr = item as GroupByExpression;
      // SQLite dialect guard: date_trunc and EXTRACT are PostgreSQL-only
      if (dialect?.name === 'sqlite') {
        const sqlLower = expr.sql.toLowerCase();
        if (sqlLower.startsWith('date_trunc(')) {
          throw new Error(
            'date_trunc expressions are not supported on SQLite. Use db.query(sql`...`) for dialect-specific SQL.',
          );
        }
        if (sqlLower.startsWith('extract(')) {
          throw new Error(
            'EXTRACT expressions are not supported on SQLite. Use db.query(sql`...`) for dialect-specific SQL.',
          );
        }
      }
      if (allAliases.has(expr.alias)) {
        throw new Error(`Duplicate alias "${expr.alias}" in groupBy by array.`);
      }
      allAliases.add(expr.alias);
      exprAliasToSql.set(expr.alias, expr.sql);
      selectParts.push(`${expr.sql} AS "${expr.alias}"`);
      groupCols.push(expr.sql);
    } else {
      const col = item as string;
      const snakeCol = camelToSnake(col);
      if (allAliases.has(col)) {
        throw new Error(`Duplicate alias "${col}" in groupBy by array.`);
      }
      allAliases.add(col);
      if (snakeCol === col) {
        selectParts.push(`"${col}"`);
      } else {
        selectParts.push(`"${snakeCol}" AS "${col}"`);
      }
      groupCols.push(`"${snakeCol}"`);
    }
  }

  // Add aggregation columns
  if (options._count !== undefined) {
    if (options._count === true) {
      selectParts.push('COUNT(*) AS "_count"');
    } else {
      for (const col of Object.keys(options._count)) {
        const snakeCol = camelToSnake(col);
        selectParts.push(`COUNT("${snakeCol}") AS "_count_${snakeCol}"`);
      }
    }
  }

  for (const [fn, aggOpt] of [
    ['AVG', options._avg],
    ['SUM', options._sum],
    ['MIN', options._min],
    ['MAX', options._max],
  ] as const) {
    if (!aggOpt) continue;
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const alias = `_${fn.toLowerCase()}_${snakeCol}`;
      selectParts.push(`${fn}("${snakeCol}") AS "${alias}"`);
    }
  }

  const allParams: unknown[] = [];
  let sql = `SELECT ${selectParts.join(', ')} FROM "${table._name}"`;

  // WHERE
  if (options.where) {
    const whereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }

  // GROUP BY
  sql += ` GROUP BY ${groupCols.join(', ')}`;

  // ORDER BY
  if (options.orderBy) {
    // Build the set of valid aggregation aliases from the requested fields
    const validAggAliases = new Set<string>();
    validAggAliases.add('_count');
    if (options._count !== undefined && options._count !== true) {
      for (const col of Object.keys(options._count)) {
        validAggAliases.add(`_count_${camelToSnake(col)}`);
      }
    }
    for (const [fn, aggOpt] of [
      ['avg', options._avg],
      ['sum', options._sum],
      ['min', options._min],
      ['max', options._max],
    ] as const) {
      if (!aggOpt) continue;
      for (const col of Object.keys(aggOpt)) {
        validAggAliases.add(`_${fn}_${camelToSnake(col)}`);
      }
    }

    const orderClauses: string[] = [];
    for (const [col, dir] of Object.entries(options.orderBy)) {
      // Validate direction — only allow 'asc' or 'desc'
      const normalizedDir = dir.toLowerCase();
      if (normalizedDir !== 'asc' && normalizedDir !== 'desc') {
        throw new Error(`Invalid orderBy direction "${dir}". Only 'asc' or 'desc' are allowed.`);
      }
      const safeDir = normalizedDir === 'desc' ? 'DESC' : 'ASC';

      if (col === '_count') {
        orderClauses.push(`COUNT(*) ${safeDir}`);
      } else if (col.startsWith('_')) {
        // Validate that the alias matches a requested aggregation field
        if (!validAggAliases.has(col)) {
          throw new Error(
            `Invalid orderBy column "${col}". Underscore-prefixed columns must match a requested aggregation alias.`,
          );
        }
        orderClauses.push(`"${col}" ${safeDir}`);
      } else if (exprAliasToSql.has(col)) {
        // Expression alias — use the SQL expression directly in ORDER BY
        orderClauses.push(`${exprAliasToSql.get(col)} ${safeDir}`);
      } else {
        orderClauses.push(`"${camelToSnake(col)}" ${safeDir}`);
      }
    }
    if (orderClauses.length > 0) {
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }
  }

  // LIMIT
  if (options.limit !== undefined) {
    allParams.push(options.limit);
    sql += ` LIMIT $${allParams.length}`;
  }

  // OFFSET
  if (options.offset !== undefined) {
    allParams.push(options.offset);
    sql += ` OFFSET $${allParams.length}`;
  }

  const res = await executeQuery<Record<string, unknown>>(queryFn, sql, allParams);

  // Restructure each row
  return (res.rows as Record<string, unknown>[]).map((row) => {
    const result: Record<string, unknown> = {};

    // Group-by columns and expressions
    for (const item of options.by) {
      if (isGroupByExpression(item)) {
        const expr = item as GroupByExpression;
        result[expr.alias] = row[expr.alias];
      } else {
        const col = item as string;
        const snakeCol = camelToSnake(col);
        result[col] = row[col] ?? row[snakeCol];
      }
    }

    // Count
    if (options._count !== undefined) {
      if (options._count === true) {
        result._count = Number(row._count ?? 0);
      } else {
        const countObj: Record<string, number> = {};
        for (const col of Object.keys(options._count)) {
          const snakeCol = camelToSnake(col);
          countObj[col] = Number(row[`_count_${snakeCol}`] ?? 0);
        }
        result._count = countObj;
      }
    }

    // Numeric aggregations (avg, sum) — always coerce to number
    for (const [fn, aggOpt] of [
      ['avg', options._avg],
      ['sum', options._sum],
    ] as const) {
      if (!aggOpt) continue;
      const fnObj: Record<string, number | null> = {};
      for (const col of Object.keys(aggOpt)) {
        const snakeCol = camelToSnake(col);
        const val = row[`_${fn}_${snakeCol}`];
        fnObj[col] = val === null || val === undefined ? null : Number(val);
      }
      result[`_${fn}`] = fnObj;
    }

    // Type-preserving aggregations (min, max) — keep original value
    for (const [fn, aggOpt] of [
      ['min', options._min],
      ['max', options._max],
    ] as const) {
      if (!aggOpt) continue;
      const fnObj: Record<string, unknown> = {};
      for (const col of Object.keys(aggOpt)) {
        const snakeCol = camelToSnake(col);
        const val = row[`_${fn}_${snakeCol}`];
        fnObj[col] = val === null || val === undefined ? null : val;
      }
      result[`_${fn}`] = fnObj;
    }

    return result;
  });
}
