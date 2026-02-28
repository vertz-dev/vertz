/**
 * Derived schemas for ModelDef — runtime parse-compatible objects built from
 * column metadata. Each schema has a `parse(data)` method that validates and
 * strips/transforms fields based on column annotations.
 */

import type { ColumnBuilder, ColumnMetadata } from './column';
import type { ColumnRecord, TableDef } from './table';

// ---------------------------------------------------------------------------
// SchemaLike — duck-typed interface compatible with @vertz/schema
// ---------------------------------------------------------------------------

export interface SchemaLike<T> {
  parse(value: unknown): { ok: true; data: T } | { ok: false; error: Error };
}

// ---------------------------------------------------------------------------
// ModelSchemas interface
// ---------------------------------------------------------------------------

export interface ModelSchemas<TTable extends TableDef<ColumnRecord>> {
  readonly response: SchemaLike<TTable['$response']>;
  readonly createInput: SchemaLike<TTable['$create_input']>;
  readonly updateInput: SchemaLike<TTable['$update_input']>;
}

// ---------------------------------------------------------------------------
// deriveSchemas factory
// ---------------------------------------------------------------------------

export function deriveSchemas<TTable extends TableDef<ColumnRecord>>(
  table: TTable,
): ModelSchemas<TTable> {
  const hiddenCols = getColumnNamesWithAnnotation(table, 'hidden');
  const readOnlyCols = getColumnNamesWhere(table, 'isReadOnly');
  const primaryCols = getColumnNamesWhere(table, 'primary');

  const allCols = new Set(Object.keys(table._columns));
  const defaultCols = getColumnNamesWhere(table, 'hasDefault');

  // Response: all columns except hidden
  const responseCols = setDifference(allCols, hiddenCols);
  // Input (create/update): all columns except readOnly and PK
  const inputCols = setDifference(setDifference(allCols, readOnlyCols), primaryCols);
  const requiredCols = getRequiredInputColumns(table, inputCols, defaultCols);

  return {
    response: {
      parse(value: unknown) {
        return { ok: true as const, data: pickKeys(value, responseCols) as TTable['$response'] };
      },
    },
    createInput: {
      parse(value: unknown) {
        const data = value as Record<string, unknown>;
        const missing = requiredCols.filter((col) => !(col in data) || data[col] === undefined);
        if (missing.length > 0) {
          return {
            ok: false as const,
            error: new Error(`Missing required fields: ${missing.join(', ')}`),
          };
        }
        return { ok: true as const, data: pickKeys(value, inputCols) as TTable['$create_input'] };
      },
    },
    updateInput: {
      parse(value: unknown) {
        return { ok: true as const, data: pickKeys(value, inputCols) as TTable['$update_input'] };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pickKeys(value: unknown, allowed: Set<string>): Record<string, unknown> {
  const data = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (allowed.has(key)) {
      result[key] = val;
    }
  }
  return result;
}

function setDifference(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (!b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

function getRequiredInputColumns(
  _table: TableDef<ColumnRecord>,
  allowed: Set<string>,
  defaults: Set<string>,
): string[] {
  return [...allowed].filter((key) => !defaults.has(key));
}

type BooleanMetaKey = Exclude<
  {
    [K in keyof ColumnMetadata]: ColumnMetadata[K] extends boolean ? K : never;
  }[keyof ColumnMetadata],
  undefined
>;

function getColumnNamesWhere(table: TableDef<ColumnRecord>, flag: BooleanMetaKey): Set<string> {
  const result = new Set<string>();
  for (const [key, col] of Object.entries(table._columns)) {
    if ((col as ColumnBuilder<unknown, ColumnMetadata>)._meta[flag]) {
      result.add(key);
    }
  }
  return result;
}

function getColumnNamesWithAnnotation(
  table: TableDef<ColumnRecord>,
  annotation: string,
): Set<string> {
  const result = new Set<string>();
  for (const [key, col] of Object.entries(table._columns)) {
    if ((col as ColumnBuilder<unknown, ColumnMetadata>)._meta._annotations[annotation]) {
      result.add(key);
    }
  }
  return result;
}
