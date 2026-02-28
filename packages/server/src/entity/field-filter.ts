import type { ColumnBuilder, ColumnMetadata, TableDef } from '@vertz/db';
import type { EntityRelationsConfig } from './types';

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
    if (col?._meta._annotations.hidden) {
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
 * Narrows relation fields in response data based on the entity's relations config.
 *
 * - `true` → keep all fields on the relation (pass through)
 * - `false` → remove the relation entirely
 * - `{ field: true, ... }` → keep only the specified fields
 * - Relation not in config → keep all fields (default: expose all)
 *
 * Only operates on keys present in the data that correspond to relation config entries.
 */
export function narrowRelationFields(
  relationsConfig: EntityRelationsConfig,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const config = relationsConfig[key];

    if (config === undefined || config === true) {
      // Not configured or explicitly true — pass through
      result[key] = value;
    } else if (config === false) {
    } else if (typeof config === 'object' && value !== null && typeof value === 'object') {
      // Per-field narrowing — keep only specified fields
      if (Array.isArray(value)) {
        // Many relation — narrow each element
        result[key] = value.map((item) => {
          const narrowed: Record<string, unknown> = {};
          for (const field of Object.keys(config)) {
            if (field in (item as Record<string, unknown>)) {
              narrowed[field] = (item as Record<string, unknown>)[field];
            }
          }
          return narrowed;
        });
      } else {
        // One relation — narrow the single object
        const narrowed: Record<string, unknown> = {};
        for (const field of Object.keys(config)) {
          if (field in (value as Record<string, unknown>)) {
            narrowed[field] = (value as Record<string, unknown>)[field];
          }
        }
        result[key] = narrowed;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Applies a select map to response data, keeping only the specified fields.
 * If select is undefined, all fields pass through unchanged.
 */
export function applySelect(
  select: Record<string, true> | undefined,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return data;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (key in data) {
      result[key] = data[key];
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
