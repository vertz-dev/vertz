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
import { NotFoundError } from '../errors/db-error';
import { generateId } from '../id/generators';
import type { ColumnBuilder, ColumnMetadata } from '../schema/column';
import type { ColumnRecord, TableDef } from '../schema/table';
import { buildDelete } from '../sql/delete';
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

export interface GetArgs {
  readonly where?: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * Get a single row matching the filter, or null if not found.
 */
export async function get<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: GetArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T | null> {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy,
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
export async function getOrThrow<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: GetArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const row = await get<T>(queryFn, table, options, dialect);
  if (row === null) {
    throw new NotFoundError(table._name);
  }
  return row;
}

export interface ListArgs {
  readonly where?: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
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
export async function list<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: ListArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T[]> {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy,
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
export async function listAndCount<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: ListArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ data: T[]; total: number }> {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy,
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

export interface CreateArgs {
  readonly data: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}

/**
 * Insert a single row and return it.
 */
export async function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
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

  const result = buildInsert({
    table: table._name,
    data: filteredData,
    returning: returningColumns,
    nowColumns,
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

export interface CreateManyArgs {
  readonly data: readonly Record<string, unknown>[];
}

/**
 * Insert multiple rows and return the count.
 */
export async function createMany(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateManyArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ count: number }> {
  if (options.data.length === 0) {
    return { count: 0 };
  }

  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);

  const filteredData = (options.data as Record<string, unknown>[]).map((row) => {
    const withIds = fillGeneratedIds(table, row);
    return Object.fromEntries(
      Object.entries(withIds).filter(([key]) => {
        // Allow columns with generate strategy to pass through (they need to be inserted)
        const col = table._columns[key];
        const meta = col ? (col as ColumnBuilder<unknown, ColumnMetadata>)._meta : undefined;
        if (meta?.generate) return true;
        return !readOnlyCols.includes(key);
      }),
    );
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

export interface CreateManyAndReturnArgs {
  readonly data: readonly Record<string, unknown>[];
  readonly select?: Record<string, unknown>;
}

/**
 * Insert multiple rows and return them.
 */
export async function createManyAndReturn<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateManyAndReturnArgs,
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
    return Object.fromEntries(
      Object.entries(withIds).filter(([key]) => {
        // Allow columns with generate strategy to pass through (they need to be inserted)
        const col = table._columns[key];
        const meta = col ? (col as ColumnBuilder<unknown, ColumnMetadata>)._meta : undefined;
        if (meta?.generate) return true;
        return !readOnlyCols.includes(key);
      }),
    );
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

export interface UpdateArgs {
  readonly where: Record<string, unknown>;
  readonly data: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}

/**
 * Update a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export async function update<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: UpdateArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);
  const autoUpdateCols = getAutoUpdateColumns(table);

  const filteredData = Object.fromEntries(
    Object.entries(options.data).filter(([key]) => !readOnlyCols.includes(key)),
  );

  // Auto-set autoUpdate columns to NOW(). The 'now' sentinel value is consumed
  // by buildUpdate: when a key appears in both `data` (with value 'now') and
  // `nowColumns`, the SQL generator emits `SET col = NOW()` instead of a
  // parameterized value. This matches the existing timestamp default convention.
  for (const col of autoUpdateCols) {
    filteredData[col] = 'now';
  }

  const allNowColumns = [...new Set([...nowColumns, ...autoUpdateCols])];

  const result = buildUpdate({
    table: table._name,
    data: filteredData,
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

export interface UpdateManyArgs {
  readonly where: Record<string, unknown>;
  readonly data: Record<string, unknown>;
}

/**
 * Update multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass updates.
 */
export async function updateMany(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: UpdateManyArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<{ count: number }> {
  assertNonEmptyWhere(options.where, 'updateMany');

  const nowColumns = getTimestampColumns(table);
  const readOnlyCols = getReadOnlyColumns(table);
  const autoUpdateCols = getAutoUpdateColumns(table);

  const filteredData = Object.fromEntries(
    Object.entries(options.data).filter(([key]) => !readOnlyCols.includes(key)),
  );

  // Auto-set autoUpdate columns to NOW() (sentinel value consumed by buildUpdate)
  for (const col of autoUpdateCols) {
    filteredData[col] = 'now';
  }

  const allNowColumns = [...new Set([...nowColumns, ...autoUpdateCols])];

  const result = buildUpdate({
    table: table._name,
    data: filteredData,
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

export interface UpsertArgs {
  readonly where: Record<string, unknown>;
  readonly create: Record<string, unknown>;
  readonly update: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}

/**
 * Upsert: INSERT ... ON CONFLICT DO UPDATE.
 *
 * The `where` keys are used as the conflict target columns.
 * If a row exists matching `where`, it is updated with `update` data.
 * Otherwise, `create` data is inserted.
 */
export async function upsert<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: UpsertArgs,
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

  // Strip readOnly fields from the update path, inject autoUpdate columns
  const filteredUpdate = Object.fromEntries(
    Object.entries(options.update).filter(([key]) => !readOnlyCols.includes(key)),
  );
  for (const col of autoUpdateCols) {
    filteredUpdate[col] = 'now';
  }

  const allNowColumns = [...new Set([...nowColumns, ...autoUpdateCols])];
  const updateColumns = Object.keys(filteredUpdate);

  const result = buildInsert({
    table: table._name,
    data: filteredCreate,
    returning: returningColumns,
    nowColumns: allNowColumns,
    onConflict: {
      columns: conflictColumns,
      action: 'update',
      updateColumns,
      updateValues: filteredUpdate,
    },
    dialect,
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, result.sql, result.params);
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Delete queries
// ---------------------------------------------------------------------------

export interface DeleteArgs {
  readonly where: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}

/**
 * Delete a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export async function deleteOne<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: DeleteArgs,
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

export interface DeleteManyArgs {
  readonly where: Record<string, unknown>;
}

/**
 * Delete multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass deletes.
 */
export async function deleteMany(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: DeleteManyArgs,
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
