/**
 * Query builder helpers — shared utilities for CRUD methods.
 *
 * Extracts column names from table definitions and resolves
 * select/visibility options to concrete column lists.
 */
import type { ColumnRecord, TableDef } from '../schema/table';
/**
 * Get all column names from a table definition.
 */
export declare function getColumnNames(table: TableDef<ColumnRecord>): string[];
/**
 * Get column names excluding hidden columns (default SELECT behavior).
 */
export declare function getDefaultColumns(table: TableDef<ColumnRecord>): string[];
/**
 * Get column names excluding sensitive AND hidden columns.
 */
export declare function getNotSensitiveColumns(table: TableDef<ColumnRecord>): string[];
/**
 * Get column names excluding hidden columns.
 */
export declare function getNotHiddenColumns(table: TableDef<ColumnRecord>): string[];
/**
 * Resolve a select option to a list of column names.
 *
 * - undefined -> default columns (exclude hidden)
 * - { not: 'sensitive' } -> exclude sensitive + hidden
 * - { not: 'hidden' } -> exclude hidden
 * - { id: true, name: true } -> explicit pick
 */
export declare function resolveSelectColumns(
  table: TableDef<ColumnRecord>,
  select?: Record<string, unknown>,
): string[];
/**
 * Get timestamp column names that support the 'now' sentinel.
 */
export declare function getTimestampColumns(table: TableDef<ColumnRecord>): string[];
/**
 * Get the primary key column name(s) for a table.
 */
export declare function getPrimaryKeyColumns(table: TableDef<ColumnRecord>): string[];
//# sourceMappingURL=helpers.d.ts.map
