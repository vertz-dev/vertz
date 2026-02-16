/**
 * CRUD query methods — DB-010.
 *
 * Implements typed find, create, update, upsert, and delete methods.
 * Each method builds SQL using the Phase 3 SQL generators, executes via
 * the provided query function, and maps results through casing conversion.
 *
 * All methods use parameterized queries (no SQL interpolation).
 */
import { NotFoundError } from '../errors/db-error';
import { buildDelete } from '../sql/delete';
import { buildInsert } from '../sql/insert';
import { buildSelect } from '../sql/select';
import { buildUpdate } from '../sql/update';
import { executeQuery } from './executor';
import { getTimestampColumns, resolveSelectColumns } from './helpers';
import { mapRow, mapRows } from './row-mapper';

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------
/**
 * Throws if the where clause is an empty object.
 * Prevents accidental mass updates/deletes when `where: {}` is passed.
 */
function assertNonEmptyWhere(where, operation) {
  if (Object.keys(where).length === 0) {
    throw new Error(
      `${operation} requires a non-empty where clause. ` +
        'Passing an empty where object would affect all rows.',
    );
  }
}
/**
 * Get a single row matching the filter, or null if not found.
 */
export async function get(queryFn, table, options) {
  const columns = resolveSelectColumns(table, options?.select);
  const result = buildSelect({
    table: table._name,
    columns,
    where: options?.where,
    orderBy: options?.orderBy,
    limit: 1,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  if (res.rows.length === 0) {
    return null;
  }
  return mapRow(res.rows[0]);
}
/**
 * Get a single row matching the filter, or throw NotFoundError.
 */
export async function getOrThrow(queryFn, table, options) {
  const row = await get(queryFn, table, options);
  if (row === null) {
    throw new NotFoundError(table._name);
  }
  return row;
}
/**
 * List multiple rows matching the filter.
 */
export async function list(queryFn, table, options) {
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
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return mapRows(res.rows);
}
/**
 * List multiple rows with total count (using COUNT(*) OVER()).
 */
export async function listAndCount(queryFn, table, options) {
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
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  const rows = res.rows;
  if (rows.length === 0) {
    return { data: [], total: 0 };
  }
  // Extract totalCount from the first row (window function adds it to every row)
  const firstRow = rows[0];
  const total = Number(firstRow.totalCount ?? 0);
  // Map rows, stripping the totalCount column
  const data = rows.map((row) => {
    const { totalCount: _tc, total_count: _tc2, ...rest } = row;
    return mapRow(rest);
  });
  return { data, total };
}
/**
 * Insert a single row and return it.
 */
export async function create(queryFn, table, options) {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const result = buildInsert({
    table: table._name,
    data: options.data,
    returning: returningColumns,
    nowColumns,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return mapRow(res.rows[0]);
}
/**
 * Insert multiple rows and return the count.
 */
export async function createMany(queryFn, table, options) {
  if (options.data.length === 0) {
    return { count: 0 };
  }
  const nowColumns = getTimestampColumns(table);
  const result = buildInsert({
    table: table._name,
    data: options.data,
    nowColumns,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return { count: res.rowCount };
}
/**
 * Insert multiple rows and return them.
 */
export async function createManyAndReturn(queryFn, table, options) {
  if (options.data.length === 0) {
    return [];
  }
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const result = buildInsert({
    table: table._name,
    data: options.data,
    returning: returningColumns,
    nowColumns,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return mapRows(res.rows);
}
/**
 * Update a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export async function update(queryFn, table, options) {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const result = buildUpdate({
    table: table._name,
    data: options.data,
    where: options.where,
    returning: returningColumns,
    nowColumns,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  if (res.rows.length === 0) {
    throw new NotFoundError(table._name);
  }
  return mapRow(res.rows[0]);
}
/**
 * Update multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass updates.
 */
export async function updateMany(queryFn, table, options) {
  assertNonEmptyWhere(options.where, 'updateMany');
  const nowColumns = getTimestampColumns(table);
  const result = buildUpdate({
    table: table._name,
    data: options.data,
    where: options.where,
    nowColumns,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return { count: res.rowCount };
}
/**
 * Upsert: INSERT ... ON CONFLICT DO UPDATE.
 *
 * The `where` keys are used as the conflict target columns.
 * If a row exists matching `where`, it is updated with `update` data.
 * Otherwise, `create` data is inserted.
 */
export async function upsert(queryFn, table, options) {
  const returningColumns = resolveSelectColumns(table, options.select);
  const nowColumns = getTimestampColumns(table);
  const conflictColumns = Object.keys(options.where);
  const updateColumns = Object.keys(options.update);
  const result = buildInsert({
    table: table._name,
    data: options.create,
    returning: returningColumns,
    nowColumns,
    onConflict: {
      columns: conflictColumns,
      action: 'update',
      updateColumns,
      updateValues: options.update,
    },
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return mapRow(res.rows[0]);
}
/**
 * Delete a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export async function deleteOne(queryFn, table, options) {
  const returningColumns = resolveSelectColumns(table, options.select);
  const result = buildDelete({
    table: table._name,
    where: options.where,
    returning: returningColumns,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  if (res.rows.length === 0) {
    throw new NotFoundError(table._name);
  }
  return mapRow(res.rows[0]);
}
/**
 * Delete multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass deletes.
 */
export async function deleteMany(queryFn, table, options) {
  assertNonEmptyWhere(options.where, 'deleteMany');
  const result = buildDelete({
    table: table._name,
    where: options.where,
  });
  const res = await executeQuery(queryFn, result.sql, result.params);
  return { count: res.rowCount };
}
/** @deprecated Use `get` instead */
export const findOne = get;
/** @deprecated Use `getOrThrow` instead */
export const findOneOrThrow = getOrThrow;
/** @deprecated Use `list` instead */
export const findMany = list;
/** @deprecated Use `listAndCount` instead */
export const findManyAndCount = listAndCount;
//# sourceMappingURL=crud.js.map
