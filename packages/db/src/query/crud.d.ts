/**
 * CRUD query methods — DB-010.
 *
 * Implements typed find, create, update, upsert, and delete methods.
 * Each method builds SQL using the Phase 3 SQL generators, executes via
 * the provided query function, and maps results through casing conversion.
 *
 * All methods use parameterized queries (no SQL interpolation).
 */
import type { ColumnRecord, TableDef } from '../schema/table';
import type { QueryFn } from './executor';
export interface GetArgs {
  readonly where?: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
}
/**
 * Get a single row matching the filter, or null if not found.
 */
export declare function get<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: GetArgs,
): Promise<T | null>;
/**
 * Get a single row matching the filter, or throw NotFoundError.
 */
export declare function getOrThrow<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: GetArgs,
): Promise<T>;
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
export declare function list<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: ListArgs,
): Promise<T[]>;
/**
 * List multiple rows with total count (using COUNT(*) OVER()).
 */
export declare function listAndCount<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options?: ListArgs,
): Promise<{
  data: T[];
  total: number;
}>;
export interface CreateArgs {
  readonly data: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}
/**
 * Insert a single row and return it.
 */
export declare function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
): Promise<T>;
export interface CreateManyArgs {
  readonly data: readonly Record<string, unknown>[];
}
/**
 * Insert multiple rows and return the count.
 */
export declare function createMany(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateManyArgs,
): Promise<{
  count: number;
}>;
export interface CreateManyAndReturnArgs {
  readonly data: readonly Record<string, unknown>[];
  readonly select?: Record<string, unknown>;
}
/**
 * Insert multiple rows and return them.
 */
export declare function createManyAndReturn<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateManyAndReturnArgs,
): Promise<T[]>;
export interface UpdateArgs {
  readonly where: Record<string, unknown>;
  readonly data: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}
/**
 * Update a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export declare function update<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: UpdateArgs,
): Promise<T>;
export interface UpdateManyArgs {
  readonly where: Record<string, unknown>;
  readonly data: Record<string, unknown>;
}
/**
 * Update multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass updates.
 */
export declare function updateMany(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: UpdateManyArgs,
): Promise<{
  count: number;
}>;
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
export declare function upsert<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: UpsertArgs,
): Promise<T>;
export interface DeleteArgs {
  readonly where: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
}
/**
 * Delete a single row matching the filter and return it.
 * Throws NotFoundError if no rows match.
 */
export declare function deleteOne<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: DeleteArgs,
): Promise<T>;
export interface DeleteManyArgs {
  readonly where: Record<string, unknown>;
}
/**
 * Delete multiple rows matching the filter and return the count.
 *
 * Throws if `where` is an empty object to prevent accidental mass deletes.
 */
export declare function deleteMany(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: DeleteManyArgs,
): Promise<{
  count: number;
}>;
/** @deprecated Use `GetArgs` instead */
export type FindOneArgs = GetArgs;
/** @deprecated Use `ListArgs` instead */
export type FindManyArgs = ListArgs;
/** @deprecated Use `get` instead */
export declare const findOne: typeof get;
/** @deprecated Use `getOrThrow` instead */
export declare const findOneOrThrow: typeof getOrThrow;
/** @deprecated Use `list` instead */
export declare const findMany: typeof list;
/** @deprecated Use `listAndCount` instead */
export declare const findManyAndCount: typeof listAndCount;
//# sourceMappingURL=crud.d.ts.map
