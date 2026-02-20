/**
 * Query builder helpers — shared utilities for CRUD methods.
 *
 * Extracts column names from table definitions and resolves
 * select/visibility options to concrete column lists.
 */

import type { ColumnBuilder, ColumnMetadata } from '../schema/column';
import type { ColumnRecord, TableDef } from '../schema/table';

/**
 * Get all column names from a table definition.
 */
export function getColumnNames(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns);
}

/**
 * Get column names excluding hidden columns (default SELECT behavior).
 */
export function getDefaultColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? !col._meta.hidden : true;
  });
}

/**
 * Get column names excluding sensitive AND hidden columns.
 */
export function getNotSensitiveColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? !col._meta.sensitive && !col._meta.hidden : true;
  });
}

/**
 * Get column names excluding hidden columns.
 */
export function getNotHiddenColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? !col._meta.hidden : true;
  });
}

/**
 * Resolve a select option to a list of column names.
 *
 * - undefined -> default columns (exclude hidden)
 * - { not: 'sensitive' } -> exclude sensitive + hidden
 * - { not: 'hidden' } -> exclude hidden
 * - { id: true, name: true } -> explicit pick
 */
export function resolveSelectColumns(
  table: TableDef<ColumnRecord>,
  select?: Record<string, unknown>,
): string[] {
  if (!select) {
    return getDefaultColumns(table);
  }

  if ('not' in select && select.not !== undefined) {
    if (select.not === 'sensitive') {
      return getNotSensitiveColumns(table);
    }
    return getNotHiddenColumns(table);
  }

  // Explicit pick — return keys set to true
  return Object.keys(select).filter((k) => select[k] === true);
}

/**
 * Get timestamp column names that support the 'now' sentinel.
 */
export function getTimestampColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? col._meta.sqlType === 'timestamp with time zone' : false;
  });
}

/**
 * Get the primary key column name(s) for a table.
 */
export function getPrimaryKeyColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? col._meta.primary : false;
  });
}

/**
 * Get column names where isReadOnly is true.
 */
export function getReadOnlyColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? col._meta.isReadOnly : false;
  });
}

/**
 * Get column names where isAutoUpdate is true.
 */
export function getAutoUpdateColumns(table: TableDef<ColumnRecord>): string[] {
  return Object.keys(table._columns).filter((key) => {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    return col ? col._meta.isAutoUpdate : false;
  });
}
