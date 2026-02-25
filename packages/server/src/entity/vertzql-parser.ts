import type { ColumnBuilder, ColumnMetadata, TableDef } from '@vertz/db';

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

export interface VertzQLOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
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
      if (op) {
        result.where[field] = {
          ...(result.where[field] as Record<string, unknown> | undefined),
          [op]: value,
        };
      } else {
        result.where[field] = value;
      }
      continue;
    }

    // limit=N
    if (key === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        result.limit = parsed;
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
    if (col?._meta.hidden) {
      hidden.add(key);
    }
  }
  return hidden;
}

/**
 * Validates parsed VertzQL options against the entity's table schema.
 *
 * Rejects:
 * - Hidden fields in `where` filters
 * - Hidden fields in `orderBy`
 */
export function validateVertzQL(options: VertzQLOptions, table: TableDef): ValidationResult {
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

  return { ok: true };
}
