import type { ColumnBuilder, ColumnMetadata, TableDef } from '@vertz/db';
import type { EntityRelationsConfig } from './types';

// ---------------------------------------------------------------------------
// VertzQL query param parser
//
// Parses readable URL params into structured query options:
//   where[field]=value          → { where: { field: value } }
//   where[field][op]=value      → { where: { field: { op: value } } }
//   orderBy=field:dir           → { orderBy: { field: dir } }
//   limit=N                     → { limit: N }
//   after=cursor                → { after: cursor }
// ---------------------------------------------------------------------------

/** Maximum allowed limit to prevent DoS via large result sets. */
export const MAX_LIMIT = 1000;

export interface VertzQLOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
  select?: Record<string, true>;
  include?: Record<string, true | Record<string, true>>;
  /** @internal Parse error for the q= param, if any. */
  _qError?: string;
}

/**
 * Parses flat query params (from URL searchParams) into structured VertzQL options.
 *
 * Bracket-notation keys like `where[status]` are parsed into nested objects.
 */
export function parseVertzQL(query: Record<string, string>): VertzQLOptions {
  const result: VertzQLOptions = {};

  for (const [key, value] of Object.entries(query)) {
    // where[field]=value or where[field][op]=value
    const whereMatch = key.match(/^where\[([^\]]+)\](?:\[([^\]]+)\])?$/);
    if (whereMatch) {
      if (!result.where) result.where = {};
      const field = whereMatch[1]!;
      const op = whereMatch[2];
      const existing = result.where[field];
      if (op) {
        // Operator filter — merge with existing operators or promote equality to { eq }
        const base =
          existing && typeof existing === 'object'
            ? (existing as Record<string, unknown>)
            : existing !== undefined
              ? { eq: existing }
              : {};
        result.where[field] = { ...base, [op]: value };
      } else {
        // Equality filter — if operators already exist on this field, merge as { eq: value }
        if (existing && typeof existing === 'object') {
          result.where[field] = { ...(existing as Record<string, unknown>), eq: value };
        } else {
          result.where[field] = value;
        }
      }
      continue;
    }

    // limit=N (clamped to [0, MAX_LIMIT])
    if (key === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        result.limit = Math.max(0, Math.min(parsed, MAX_LIMIT));
      }
      continue;
    }

    // after=cursor
    if (key === 'after') {
      if (value) {
        result.after = value;
      }
      continue;
    }

    // orderBy=field:dir
    if (key === 'orderBy') {
      const [field, dir] = value.split(':');
      if (field) {
        if (!result.orderBy) result.orderBy = {};
        result.orderBy[field] = dir === 'desc' ? 'desc' : 'asc';
      }
      continue;
    }

    // q= param (base64url-encoded structural query)
    if (key === 'q') {
      try {
        // URL-decode first, then convert base64url to standard base64
        const urlDecoded = decodeURIComponent(value);
        const b64 = urlDecoded.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const decoded = JSON.parse(atob(padded)) as Record<string, unknown>;
        if (decoded.select && typeof decoded.select === 'object') {
          result.select = decoded.select as Record<string, true>;
        }
        if (decoded.include && typeof decoded.include === 'object') {
          result.include = decoded.include as Record<string, true | Record<string, true>>;
        }
      } catch {
        result._qError = 'Invalid q= parameter: not valid base64 or JSON';
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationOk {
  ok: true;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationOk | ValidationError;

/**
 * Resolves hidden column names from a table definition.
 */
function getHiddenColumns(table: TableDef): Set<string> {
  const hidden = new Set<string>();
  for (const key of Object.keys(table._columns)) {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    if (col?._meta._annotations.hidden) {
      hidden.add(key);
    }
  }
  return hidden;
}

/**
 * Validates parsed VertzQL options against the entity's table schema and relations config.
 *
 * Rejects:
 * - Hidden fields in `where` filters
 * - Hidden fields in `orderBy`
 * - Hidden fields in `select`
 * - Includes for relations not exposed in entity config
 * - Over-wide field selections on includes beyond entity config restrictions
 */
export function validateVertzQL(
  options: VertzQLOptions,
  table: TableDef,
  relationsConfig?: EntityRelationsConfig,
): ValidationResult {
  // Surface q= parse errors
  if (options._qError) {
    return { ok: false, error: options._qError };
  }

  const hiddenColumns = getHiddenColumns(table);

  // Validate where fields
  if (options.where) {
    for (const field of Object.keys(options.where)) {
      if (hiddenColumns.has(field)) {
        return { ok: false, error: `Field "${field}" is not filterable` };
      }
    }
  }

  // Validate orderBy fields
  if (options.orderBy) {
    for (const field of Object.keys(options.orderBy)) {
      if (hiddenColumns.has(field)) {
        return { ok: false, error: `Field "${field}" is not sortable` };
      }
    }
  }

  // Validate select fields
  if (options.select) {
    for (const field of Object.keys(options.select)) {
      if (hiddenColumns.has(field)) {
        return { ok: false, error: `Field "${field}" is not selectable` };
      }
    }
  }

  // Validate include against entity relations config
  if (options.include && relationsConfig) {
    for (const [relation, requested] of Object.entries(options.include)) {
      const entityConfig = relationsConfig[relation];

      // Relation not in config or explicitly false → rejected
      if (entityConfig === undefined || entityConfig === false) {
        return { ok: false, error: `Relation "${relation}" is not exposed` };
      }

      // If entity config narrows to specific fields, validate the request is within bounds
      if (typeof entityConfig === 'object' && typeof requested === 'object') {
        for (const field of Object.keys(requested)) {
          if (!(field in entityConfig)) {
            return {
              ok: false,
              error: `Field "${field}" is not exposed on relation "${relation}"`,
            };
          }
        }
      }
    }
  }

  return { ok: true };
}
