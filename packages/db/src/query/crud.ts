/**
 * CRUD query methods — DB-010.
 *
 * Implements typed find, create, update, upsert, and delete methods.
 * Each method builds SQL using the Phase 3 SQL generators, executes via
 * the provided query function, and maps results through casing conversion.
 *
 * All methods use parameterized queries (no SQL interpolation).
 */

import type { Dialect } from '../dialect';
import { defaultPostgresDialect } from '../dialect';
import type { DialectName } from '../dialect/types';
import { JsonbValidationError, NotFoundError } from '../errors/db-error';
import { generateId } from '../id/generators';
import type { ColumnBuilder, ColumnMetadata } from '../schema/column';
import type {
  FilterType,
  InsertInput,
  OrderByType,
  SelectOption,
  UpdateInput,
} from '../schema/inference';
import type { ColumnRecord, TableDef } from '../schema/table';
import { buildDelete } from '../sql/delete';
import { isDbExpr } from '../sql/expr';
import { buildInsert } from '../sql/insert';
import { buildSelect } from '../sql/select';
import { buildUpdate } from '../sql/update';
import type { QueryFn } from './executor';
import { executeQuery } from './executor';
import {
  getAutoUpdateColumns,
  getReadOnlyColumns,
  getTimestampColumns,
  resolveSelectColumns,
} from './helpers';
import { mapRow, mapRows } from './row-mapper';

// ---------------------------------------------------------------------------
// ID Generation Helper
// ---------------------------------------------------------------------------

/**
 * Fill in auto-generated IDs for primary key columns that have a `generate` strategy.
 * Only fills when the value is `undefined` (missing). Explicit values (including `null`) are respected.
 */
function fillGeneratedIds(
  table: TableDef<ColumnRecord>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const filled = { ...data };
  for (const [name, col] of Object.entries(table._columns)) {
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (meta.generate && filled[name] === undefined) {
      // Runtime guard: reject generate on non-string column types
      if (meta.sqlType === 'integer' || meta.sqlType === 'serial' || meta.sqlType === 'bigint') {
        throw new Error(
          `Column "${name}" has generate: '${meta.generate}' but is type '${meta.sqlType}'. ` +
            `ID generation is only supported on string column types (text, uuid, varchar).`,
        );
      }
      filled[name] = generateId(meta.generate);
    }
  }
  return filled;
}

// ---------------------------------------------------------------------------
// JSONB Validator on Writes
// ---------------------------------------------------------------------------

/**
 * Per-table memoised flag: does the table carry any column with a `validator`?
 * The walk runs once per table on first use; subsequent writes pay one WeakMap
 * lookup. Keeps `createMany` hot-path cheap on validator-free tables.
 */
const tableHasJsonbValidator = new WeakMap<TableDef<ColumnRecord>, boolean>();

function hasJsonbValidator(table: TableDef<ColumnRecord>): boolean {
  const cached = tableHasJsonbValidator.get(table);
  if (cached !== undefined) return cached;
  let found = false;
  for (const col of Object.values(table._columns)) {
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (meta.validator) {
      found = true;
      break;
    }
  }
  tableHasJsonbValidator.set(table, found);
  return found;
}

/**
 * Run any column-attached `validator` over the write payload for that column.
 * Returns a new object carrying the validator's output (so transforms persist).
 *
 * Skips:
 * - columns without a validator
 * - `null` / `undefined` values (nullable columns, omitted fields)
 * - `DbExpr` values (SQL expressions like `arrayAppend(col, ...)`)
 *
 * Timestamp `'now'` sentinels are skipped structurally — timestamp columns
 * have no `meta.validator`, so the `!meta.validator` short-circuit handles
 * them without a value-type check that could collide with a jsonb payload
 * legitimately equal to the string `'now'`.
 *
 * Throws `JsonbValidationError` on the first column whose validator rejects.
 * The throw propagates through the CRUD function and is caught by the
 * `toWriteError` wrapper in `database.ts`, surfacing as
 * `{ ok: false, error: { code: 'JSONB_VALIDATION_ERROR', ... } }`.
 */
function runJsonbValidators(
  table: TableDef<ColumnRecord>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!hasJsonbValidator(table)) return data;
  const out: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    const col = table._columns[key];
    if (!col) continue;
    const meta = (col as ColumnBuilder<unknown, ColumnMetadata>)._meta;
    if (!meta.validator) continue;
    if (value === null || value === undefined) continue;
    if (isDbExpr(value)) continue;
    try {
      out[key] = meta.validator.parse(value);
    } catch (cause) {
      throw new JsonbValidationError({ table: table._name, column: key, value, cause });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------

/**
 * Throws if the where clause is an empty object.
 * Prevents accidental mass updates/deletes when `where: {}` is passed.
 */
function assertNonEmptyWhere(where: Record<string, unknown>, operation: string): void {
  if (Object.keys(where).length === 0) {
    throw new Error(
      `${operation} requires a non-empty where clause. ` +
        'Passing an empty where object would affect all rows.',
    );
  }
}

// ---------------------------------------------------------------------------
// Find queries
// ---------------------------------------------------------------------------

export interface GetArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where?: FilterType<TColumns, TDialect>;
  readonly select?: SelectOption<TColumns>;
  readonly orderBy?: OrderByType<TColumns>;
}

/**
 * Get a single row matching the filter, or null if not found.
 */
export async function get<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options?: GetArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T | null> {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy as Record<string, 'asc' | 'desc'> | undefined,
    limit: 1,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  if (res.rows.length === 0) {
    return null;
  }
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

/**
 * Get a single row matching the filter, or throw NotFoundError.
 */
export async function getOrThrow<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options?: GetArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const row = await get<TColumns, T>(queryFn, table, options, dialect);
  if (row === null) {
    throw new NotFoundError(table._name);
  }
  return row;
}

export interface ListArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where?: FilterType<TColumns, TDialect>;
  readonly select?: SelectOption<TColumns>;
  readonly orderBy?: OrderByType<TColumns>;
  readonly limit?: number;
  readonly offset?: number;
  /** Cursor object: column-value pairs marking the position to paginate from. */
  readonly cursor?: Record<string, unknown>;
  /** Number of rows to take (used with cursor). Aliases `limit` when cursor is present. */
  readonly take?: number;
}

/**
 * List multiple rows matching the filter.
 */
export async function list<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options?: ListArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T[]> {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy as Record<string, 'asc' | 'desc'> | undefined,
    limit: options?.limit,
    offset: options?.offset,
    cursor: options?.cursor,
    take: options?.take,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return mapRows<T>(res.rows as Record<string, unknown>[]);
}

/**
 * List multiple rows with total count (using COUNT(*) OVER()).
 */
export async function listAndCount<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options?: ListArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ data: T[]; total: number }> {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy as Record<string, 'asc' | 'desc'> | undefined,
    limit: options?.limit,
    offset: options?.offset,
    cursor: options?.cursor,
    take: options?.take,
    withCount: true,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  const rows = res.rows as Record<string, unknown>[];

  if (rows.length === 0) {
    return { data: [], total: 0 };
  }

  // Extract totalCount from the first row (window function adds it to every row)
  const firstRow = rows[0] as Record<string, unknown>;
  const total = Number(firstRow.totalCount ?? 0);

  // Map rows, stripping the totalCount column
  const data = rows.map((row) => {
    const { totalCount: _tc, total_count: _tc2, ...rest } = row;
    return mapRow<T>(rest);
  });

  return { data, total };
}

// ---------------------------------------------------------------------------
// Create queries
// ---------------------------------------------------------------------------

export interface CreateArgs<TColumns extends ColumnRecord = ColumnRecord> {
  readonly data: InsertInput<TableDef<TColumns>>;
  readonly select?: SelectOption<TColumns>;
}

/**
 * Insert a single row and return it.
 */
export async function create<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: CreateArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);

  // Generate IDs before filtering readOnly columns
  // Note: don't filter out columns that have a generate strategy, as those IDs need to be inserted
  const withIds = fillGeneratedIds(table, options.data);
  const filteredData = Object.fromEntries(
    Object.entries(withIds).filter(([key]) => {
      // Allow columns with generate strategy to pass through (they need to be inserted)
      const col = table._columns[key];
      const meta = col ? (col as ColumnBuilder<unknown, ColumnMetadata>)._meta : undefined;
      if (meta?.generate) return true;
      return !readOnlyCols.includes(key);
    }),
  );

  const validated = runJsonbValidators(table, filteredData);

  const result = buildInsert({
    table: table._name,
    data: validated,
    returning: returningColumns,
    nowColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

export interface CreateManyArgs<TColumns extends ColumnRecord = ColumnRecord> {
  readonly data: readonly InsertInput<TableDef<TColumns>>[];
}

/**
 * Insert multiple rows and return the count.
 */
export async function createMany<TColumns extends ColumnRecord>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: CreateManyArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ count: number }> {
  if (options.data.length === 0) {
    return { count: 0 };
  }

  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);

  const filteredData = (options.data as Record<string, unknown>[]).map((row) => {
    const withIds = fillGeneratedIds(table, row);
    const filtered = Object.fromEntries(
      Object.entries(withIds).filter(([key]) => {
        // Allow columns with generate strategy to pass through (they need to be inserted)
        const col = table._columns[key];
        const meta = col ? (col as ColumnBuilder<unknown, ColumnMetadata>)._meta : undefined;
        if (meta?.generate) return true;
        return !readOnlyCols.includes(key);
      }),
    );
    return runJsonbValidators(table, filtered);
  });

  const result = buildInsert({
    table: table._name,
    data: filteredData,
    nowColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return { count: res.rowCount };
}

export interface CreateManyAndReturnArgs<TColumns extends ColumnRecord = ColumnRecord> {
  readonly data: readonly InsertInput<TableDef<TColumns>>[];
  readonly select?: SelectOption<TColumns>;
}

/**
 * Insert multiple rows and return them.
 */
export async function createManyAndReturn<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: CreateManyAndReturnArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T[]> {
  if (options.data.length === 0) {
    return [];
  }

  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);

  const filteredData = (options.data as Record<string, unknown>[]).map((row) => {
    const withIds = fillGeneratedIds(table, row);
    const filtered = Object.fromEntries(
      Object.entries(withIds).filter(([key]) => {
        // Allow columns with generate strategy to pass through (they need to be inserted)
        const col = table._columns[key];
        const meta = col ? (col as ColumnBuilder<unknown, ColumnMetadata>)._meta : undefined;
        if (meta?.generate) return true;
        return !readOnlyCols.includes(key);
      }),
    );
    return runJsonbValidators(table, filtered);
  });

  const result = buildInsert({
    table: table._name,
    data: filteredData,
    returning: returningColumns,
    nowColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return mapRows<T>(res.rows as Record<string, unknown>[]);
}

// ---------------------------------------------------------------------------
// Update queries
// ---------------------------------------------------------------------------

export interface UpdateArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where: FilterType<TColumns, TDialect>;
  readonly data: UpdateInput<TableDef<TColumns>>;
  readonly select?: SelectOption<TColumns>;
}

/**
 * Update a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export async function update<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: UpdateArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);
  const autoUpdateCols = getAutoUpdateColumns(table);

  // Strip readOnly columns, but let autoUpdate columns through when user provides a DbExpr
  const autoUpdateSet = new Set(autoUpdateCols);
  const filteredData = Object.fromEntries(
    Object.entries(options.data).filter(
      ([key, val]) => !readOnlyCols.includes(key) || (autoUpdateSet.has(key) && isDbExpr(val)),
    ),
  );

  // Auto-set autoUpdate columns to NOW() unless the user already provided a
  // value (including DbExpr). The 'now' sentinel is consumed by buildUpdate:
  // when a key appears in both `data` (with value 'now') and `nowColumns`, the
  // SQL generator emits `SET col = NOW()`.
  for (const col of autoUpdateCols) {
    if (!(col in filteredData)) {
      filteredData[col] = 'now';
    }
  }

  const allNowColumns = [...new Set([...nowColumns, ...autoUpdateCols])];
  const validated = runJsonbValidators(table, filteredData);

  const result = buildUpdate({
    table: table._name,
    data: validated,
    where: options.where,
    returning: returningColumns,
    nowColumns: allNowColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  if (res.rows.length === 0) {
    throw new NotFoundError(table._name);
  }
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

export interface UpdateManyArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where: FilterType<TColumns, TDialect>;
  readonly data: UpdateInput<TableDef<TColumns>>;
}

/**
 * Update multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass updates.
 */
export async function updateMany<TColumns extends ColumnRecord>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: UpdateManyArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ count: number }> {
  assertNonEmptyWhere(options.where, 'updateMany');

  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);
  const autoUpdateCols = getAutoUpdateColumns(table);

  // Strip readOnly columns, but let autoUpdate columns through when user provides a DbExpr
  const autoUpdateSet = new Set(autoUpdateCols);
  const filteredData = Object.fromEntries(
    Object.entries(options.data).filter(
      ([key, val]) => !readOnlyCols.includes(key) || (autoUpdateSet.has(key) && isDbExpr(val)),
    ),
  );

  // Auto-set autoUpdate columns to NOW() unless user provided a value
  for (const col of autoUpdateCols) {
    if (!(col in filteredData)) {
      filteredData[col] = 'now';
    }
  }

  const allNowColumns = [...new Set([...nowColumns, ...autoUpdateCols])];
  const validated = runJsonbValidators(table, filteredData);

  const result = buildUpdate({
    table: table._name,
    data: validated,
    where: options.where,
    nowColumns: allNowColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return { count: res.rowCount };
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

export interface UpsertArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where: FilterType<TColumns, TDialect>;
  readonly create: InsertInput<TableDef<TColumns>>;
  readonly update: UpdateInput<TableDef<TColumns>>;
  readonly select?: SelectOption<TColumns>;
}

/**
 * Upsert: INSERT ... ON CONFLICT DO UPDATE.
 *
 * The `where` keys are used as the conflict target columns.
 * If a row exists matching `where`, it is updated with `update` data.
 * Otherwise, `create` data is inserted.
 */
export async function upsert<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: UpsertArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);
  const autoUpdateCols = getAutoUpdateColumns(table);
  const conflictColumns = Object.keys(options.where);

  // Generate IDs before filtering readOnly fields from the create path
  // Note: don't filter out columns that have a generate strategy, as those IDs need to be inserted
  const createWithIds = fillGeneratedIds(table, options.create);
  // Strip readOnly fields from the create path
  const filteredCreate = Object.fromEntries(
    Object.entries(createWithIds).filter(([key]) => {
      // Allow columns with generate strategy to pass through (they need to be inserted)
      const col = table._columns[key];
      const meta = col ? (col as ColumnBuilder<unknown, ColumnMetadata>)._meta : undefined;
      if (meta?.generate) return true;
      return !readOnlyCols.includes(key);
    }),
  );

  // Strip readOnly fields from the update path, but let autoUpdate columns through with DbExpr
  const autoUpdateSet = new Set(autoUpdateCols);
  const filteredUpdate = Object.fromEntries(
    Object.entries(options.update).filter(
      ([key, val]) => !readOnlyCols.includes(key) || (autoUpdateSet.has(key) && isDbExpr(val)),
    ),
  );
  for (const col of autoUpdateCols) {
    if (!(col in filteredUpdate)) {
      filteredUpdate[col] = 'now';
    }
  }

  const allNowColumns = [...new Set([...nowColumns, ...autoUpdateCols])];
  const validatedCreate = runJsonbValidators(table, filteredCreate);
  const validatedUpdate = runJsonbValidators(table, filteredUpdate);
  const updateColumns = Object.keys(validatedUpdate);

  const result = buildInsert({
    table: table._name,
    data: validatedCreate,
    returning: returningColumns,
    nowColumns: allNowColumns,
    onConflict: {
      columns: conflictColumns,
      action: 'update',
      updateColumns,
      updateValues: validatedUpdate,
    },
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Delete queries
// ---------------------------------------------------------------------------

export interface DeleteArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where: FilterType<TColumns, TDialect>;
  readonly select?: SelectOption<TColumns>;
}

/**
 * Delete a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export async function deleteOne<TColumns extends ColumnRecord, T>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: DeleteArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);

  const result = buildDelete({
    table: table._name,
    where: options.where,
    returning: returningColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  if (res.rows.length === 0) {
    throw new NotFoundError(table._name);
  }
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

export interface DeleteManyArgs<
  TColumns extends ColumnRecord = ColumnRecord,
  TDialect extends DialectName = DialectName,
> {
  readonly where: FilterType<TColumns, TDialect>;
}

/**
 * Delete multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass deletes.
 */
export async function deleteMany<TColumns extends ColumnRecord>(
  queryFn: QueryFn,
  table: TableDef<TColumns>,
  options: DeleteManyArgs<TColumns>,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ count: number }> {
  assertNonEmptyWhere(options.where, 'deleteMany');

  const result = buildDelete({
    table: table._name,
    where: options.where,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return { count: res.rowCount };
}

// ---------------------------------------------------------------------------
// Deprecated aliases (backwards compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Use `GetArgs` instead */
export type FindOneArgs = GetArgs;
/** @deprecated Use `ListArgs` instead */
export type FindManyArgs = ListArgs;
/** @deprecated Use `get` instead */
export const findOne: typeof get = get;
/** @deprecated Use `getOrThrow` instead */
export const findOneOrThrow: typeof getOrThrow = getOrThrow;
/** @deprecated Use `list` instead */
export const findMany: typeof list = list;
/** @deprecated Use `listAndCount` instead */
export const findManyAndCount: typeof listAndCount = listAndCount;
