import type { ColumnBuilder, ColumnMetadata, InferColumnType } from './column';
import type { RelationDef } from './relation';

// ---------------------------------------------------------------------------
// Index Definition
// ---------------------------------------------------------------------------

export interface IndexDef {
  readonly columns: readonly string[];
  readonly name?: string;
  readonly unique?: boolean;
}

export function createIndex(
  columns: string | string[],
  options?: { name?: string; unique?: boolean },
): IndexDef {
  return {
    columns: Array.isArray(columns) ? columns : [columns],
    ...options,
  };
}

// ---------------------------------------------------------------------------
// Type-level utilities for deriving types from column definitions
// ---------------------------------------------------------------------------

/** A record of column builders -- the shape passed to d.table(). */
export type ColumnRecord = Record<string, ColumnBuilder<unknown, ColumnMetadata>>;

/** Extract the TypeScript type from every column in a record. */
type InferColumns<T extends ColumnRecord> = {
  [K in keyof T]: InferColumnType<T[K]>;
};

/** Keys of columns where a given metadata property is `true`. */
type ColumnKeysWhere<T extends ColumnRecord, Flag extends keyof ColumnMetadata> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? M extends Record<Flag, true>
      ? K
      : never
    : never;
}[keyof T];

/** Keys of columns where a given metadata property is NOT `true` (i.e., false). */
type ColumnKeysWhereNot<T extends ColumnRecord, Flag extends keyof ColumnMetadata> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? M extends Record<Flag, true>
      ? never
      : K
    : never;
}[keyof T];

/** Keys of columns that do NOT have ANY of the specified annotations in `_annotations`. */
type ColumnKeysWithoutAnyAnnotation<T extends ColumnRecord, Annotations extends string> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? M['_annotations'] extends Record<Annotations, true>
      ? never
      : K
    : never;
}[keyof T];

/** Extracts the union of all annotation names present across all columns in a record. */
export type AllAnnotations<T extends ColumnRecord> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? keyof M['_annotations'] & string
    : never;
}[keyof T];

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

/**
 * $infer -- default SELECT type.
 * Excludes columns annotated 'hidden'. Includes everything else.
 */
type Infer<T extends ColumnRecord> = {
  [K in ColumnKeysWithoutAnyAnnotation<T, 'hidden'>]: InferColumnType<T[K]>;
};

/**
 * $infer_all -- all columns including hidden.
 */
type InferAll<T extends ColumnRecord> = InferColumns<T>;

/**
 * $insert -- write type. ALL columns included (visibility is read-side only).
 * Columns with hasDefault: true become optional.
 */
type Insert<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'hasDefault'>]: InferColumnType<T[K]>;
} & {
  [K in ColumnKeysWhere<T, 'hasDefault'>]?: InferColumnType<T[K]>;
};

/**
 * $update -- write type. ALL non-primary-key columns, all optional.
 * Primary key excluded (you don't update a PK).
 */
type Update<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'primary'>]?: InferColumnType<T[K]>;
};

/**
 * $response -- API response shape. Excludes columns annotated 'hidden'.
 */
type Response<T extends ColumnRecord> = {
  [K in ColumnKeysWithoutAnyAnnotation<T, 'hidden'>]: InferColumnType<T[K]>;
};

/**
 * $create_input -- API create input shape.
 * Excludes readOnly and primary key columns.
 * Columns with defaults are optional.
 */
type ApiCreateInput<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'isReadOnly'> &
    ColumnKeysWhereNot<T, 'primary'> &
    ColumnKeysWhereNot<T, 'hasDefault'> &
    string]: InferColumnType<T[K]>;
} & {
  [K in ColumnKeysWhereNot<T, 'isReadOnly'> &
    ColumnKeysWhereNot<T, 'primary'> &
    ColumnKeysWhere<T, 'hasDefault'> &
    string]?: InferColumnType<T[K]>;
};

/**
 * $update_input -- API update input shape.
 * Excludes readOnly and primary key columns. All fields optional (partial update).
 */
type ApiUpdateInput<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'isReadOnly'> &
    ColumnKeysWhereNot<T, 'primary'> &
    string]?: InferColumnType<T[K]>;
};

// ---------------------------------------------------------------------------
// TableDef interface
// ---------------------------------------------------------------------------

export interface TableDef<TColumns extends ColumnRecord = ColumnRecord> {
  readonly _name: string;
  readonly _columns: TColumns;
  readonly _indexes: readonly IndexDef[];
  readonly _shared: boolean;

  /** Default SELECT type -- excludes columns annotated 'hidden'. */
  readonly $infer: Infer<TColumns>;
  /** All columns including hidden. */
  readonly $infer_all: InferAll<TColumns>;
  /** Insert type -- defaulted columns optional. ALL columns included. */
  readonly $insert: Insert<TColumns>;
  /** Update type -- all non-PK columns optional. ALL columns included. */
  readonly $update: Update<TColumns>;

  /** API response shape — excludes columns annotated 'hidden'. */
  readonly $response: Response<TColumns>;
  /** API create input — excludes readOnly + PK; defaulted columns optional. */
  readonly $create_input: ApiCreateInput<TColumns>;
  /** API update input — excludes readOnly + PK; all fields optional. */
  readonly $update_input: ApiUpdateInput<TColumns>;

  /** Mark this table as shared / cross-tenant. */
  shared(): TableDef<TColumns>;
}

// ---------------------------------------------------------------------------
// Table options
// ---------------------------------------------------------------------------

export interface TableOptions {
  relations?: Record<string, RelationDef>;
  indexes?: IndexDef[];
}

// ---------------------------------------------------------------------------
// createTable factory
// ---------------------------------------------------------------------------

export function createTable<TColumns extends ColumnRecord>(
  name: string,
  columns: TColumns,
  options?: TableOptions,
): TableDef<TColumns> {
  return createTableInternal(name, columns, options?.indexes ?? [], false);
}

function createTableInternal<TColumns extends ColumnRecord>(
  name: string,
  columns: TColumns,
  indexes: readonly IndexDef[],
  shared: boolean,
): TableDef<TColumns> {
  const table: TableDef<TColumns> = {
    _name: name,
    _columns: columns,
    _indexes: indexes,
    _shared: shared,

    // Derived type properties are phantom -- they exist only at the type level.
    // At runtime they are never accessed; we use `undefined as never` to avoid
    // allocating objects that would never be read.
    get $infer(): Infer<TColumns> {
      return undefined as never;
    },
    get $infer_all(): InferAll<TColumns> {
      return undefined as never;
    },
    get $insert(): Insert<TColumns> {
      return undefined as never;
    },
    get $update(): Update<TColumns> {
      return undefined as never;
    },
    get $response(): Response<TColumns> {
      return undefined as never;
    },
    get $create_input(): ApiCreateInput<TColumns> {
      return undefined as never;
    },
    get $update_input(): ApiUpdateInput<TColumns> {
      return undefined as never;
    },

    shared() {
      return createTableInternal(name, columns, indexes, true);
    },
  };
  return table;
}
