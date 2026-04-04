/**
 * GroupBy expression types and builders for computed SQL expressions.
 *
 * Provides d.fn.date(), d.fn.dateTrunc(), and d.fn.extract() for
 * time-series grouping in groupBy() queries.
 */

import { camelToSnake, snakeToCamel } from '../sql/casing';

// ---------------------------------------------------------------------------
// GroupByExpression — opaque tagged type
// ---------------------------------------------------------------------------

/**
 * A computed SQL expression for use in groupBy `by` arrays.
 *
 * TCol is a phantom type capturing the column name for type-level validation
 * when used inside TypedGroupByArgs.
 *
 * Only constructible via d.fn.* builders — treat as opaque.
 *
 * SECURITY: The `sql` field is interpolated directly into SQL. Only construct
 * via d.fn.date(), d.fn.dateTrunc(), or d.fn.extract() which produce safe SQL
 * with properly quoted column identifiers. Do not construct manually with
 * user-provided strings.
 */
export interface GroupByExpression<TCol extends string = string> {
  readonly _tag: 'GroupByExpression';
  /** The original column name — anchors the TCol phantom type for structural checking. */
  readonly _column: TCol;
  /** The SQL fragment (e.g., `DATE("clicked_at")`). */
  readonly sql: string;
  /** The camelCase alias used in SELECT, orderBy, and result mapping. */
  readonly alias: string;
}

/**
 * Type guard to distinguish GroupByExpression from column name strings.
 */
export function isGroupByExpression(item: string | GroupByExpression): item is GroupByExpression {
  return (
    typeof item === 'object' &&
    item !== null &&
    '_tag' in item &&
    (item as GroupByExpression)._tag === 'GroupByExpression'
  );
}

// ---------------------------------------------------------------------------
// Precision and field types + validation sets
// ---------------------------------------------------------------------------

/** Valid precisions for date_trunc(). */
export type DateTruncPrecision =
  | 'microsecond'
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

/** Valid fields for EXTRACT(). */
export type ExtractField =
  | 'century'
  | 'day'
  | 'decade'
  | 'dow'
  | 'doy'
  | 'epoch'
  | 'hour'
  | 'isodow'
  | 'isoyear'
  | 'microsecond'
  | 'millisecond'
  | 'minute'
  | 'month'
  | 'quarter'
  | 'second'
  | 'timezone'
  | 'timezone_hour'
  | 'timezone_minute'
  | 'week'
  | 'year';

export const VALID_DATE_TRUNC_PRECISIONS: ReadonlySet<string> = new Set<string>([
  'microsecond',
  'millisecond',
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);

export const VALID_EXTRACT_FIELDS: ReadonlySet<string> = new Set<string>([
  'century',
  'day',
  'decade',
  'dow',
  'doy',
  'epoch',
  'hour',
  'isodow',
  'isoyear',
  'microsecond',
  'millisecond',
  'minute',
  'month',
  'quarter',
  'second',
  'timezone',
  'timezone_hour',
  'timezone_minute',
  'week',
  'year',
]);

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

/** DATE(column) — extract date part from a timestamp column. */
export function fnDate<TCol extends string>(column: TCol): GroupByExpression<TCol> {
  const snakeCol = camelToSnake(column);
  return {
    _tag: 'GroupByExpression',
    _column: column,
    sql: `DATE("${snakeCol}")`,
    alias: snakeToCamel(`date_${snakeCol}`),
  };
}

/** date_trunc(precision, column) — truncate timestamp to given precision. */
export function fnDateTrunc<TCol extends string>(
  precision: DateTruncPrecision,
  column: TCol,
): GroupByExpression<TCol> {
  if (!VALID_DATE_TRUNC_PRECISIONS.has(precision)) {
    throw new Error(
      `Invalid date_trunc precision: "${precision}". Valid: ${[...VALID_DATE_TRUNC_PRECISIONS].join(', ')}`,
    );
  }
  const snakeCol = camelToSnake(column);
  return {
    _tag: 'GroupByExpression',
    _column: column,
    sql: `date_trunc('${precision}', "${snakeCol}")`,
    alias: snakeToCamel(`date_trunc_${precision}_${snakeCol}`),
  };
}

/** EXTRACT(field FROM column) — extract a date/time field from a timestamp column. */
export function fnExtract<TCol extends string>(
  field: ExtractField,
  column: TCol,
): GroupByExpression<TCol> {
  if (!VALID_EXTRACT_FIELDS.has(field)) {
    throw new Error(
      `Invalid EXTRACT field: "${field}". Valid: ${[...VALID_EXTRACT_FIELDS].join(', ')}`,
    );
  }
  const snakeCol = camelToSnake(column);
  // EXTRACT fields with underscores (e.g., 'timezone_hour') use spaces in SQL syntax
  const sqlField = field.replace(/_/g, ' ');
  return {
    _tag: 'GroupByExpression',
    _column: column,
    sql: `EXTRACT(${sqlField} FROM "${snakeCol}")`,
    alias: snakeToCamel(`extract_${field}_${snakeCol}`),
  };
}
