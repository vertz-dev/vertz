import type { ColumnBuilder, ColumnMetadata, TableDef } from '@vertz/db';

/**
 * Strips hidden columns from response data.
 * Used after DB reads to remove sensitive fields from API responses.
 */
export function stripHiddenFields(
  table: TableDef,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const hiddenKeys = new Set<string>();
  for (const key of Object.keys(table._columns)) {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    if (col?._meta.hidden) {
      hiddenKeys.add(key);
    }
  }
  if (hiddenKeys.size === 0) return data;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!hiddenKeys.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Strips readOnly and primary key columns from input data.
 * Used before DB writes to prevent setting immutable fields.
 */
export function stripReadOnlyFields(
  table: TableDef,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const excludedKeys = new Set<string>();
  for (const key of Object.keys(table._columns)) {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    if (col?._meta.isReadOnly || col?._meta.primary) {
      excludedKeys.add(key);
    }
  }
  if (excludedKeys.size === 0) return data;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!excludedKeys.has(key)) {
      result[key] = value;
    }
  }
  return result;
}
