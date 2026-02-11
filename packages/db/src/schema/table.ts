import type { ColumnBuilder, ColumnMetadata, InferColumnType } from './column';

// ---------------------------------------------------------------------------
// Index Definition
// ---------------------------------------------------------------------------

export interface IndexDef {
  readonly columns: readonly string[];
}

export function createIndex(columns: string | string[]): IndexDef {
  return {
    columns: Array.isArray(columns) ? columns : [columns],
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

/** Keys of columns where a given metadata flag is `true`. */
type ColumnKeysWhere<T extends ColumnRecord, Flag extends keyof ColumnMetadata> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? M extends Record<Flag, true>
      ? K
      : never
    : never;
}[keyof T];

/** Keys of columns where a given metadata flag is NOT `true` (i.e., false). */
type ColumnKeysWhereNot<T extends ColumnRecord, Flag extends keyof ColumnMetadata> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? M extends Record<Flag, true>
      ? never
      : K
    : never;
}[keyof T];

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

/**
 * $infer -- default SELECT type.
 * Excludes hidden columns. Includes everything else (including sensitive).
 */
type Infer<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'hidden'>]: InferColumnType<T[K]>;
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
 * $not_sensitive -- excludes columns marked .sensitive() OR .hidden().
 * (hidden implies sensitive for read purposes)
 */
type NotSensitive<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'sensitive'> &
    ColumnKeysWhereNot<T, 'hidden'> &
    keyof T]: InferColumnType<T[K]>;
};

/**
 * $not_hidden -- excludes columns marked .hidden().
 * Same as $infer (excludes hidden, keeps sensitive).
 */
type NotHidden<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'hidden'>]: InferColumnType<T[K]>;
};

// ---------------------------------------------------------------------------
// TableDef interface
// ---------------------------------------------------------------------------

export interface TableDef<TColumns extends ColumnRecord = ColumnRecord> {
  readonly _name: string;
  readonly _columns: TColumns;
  readonly _indexes: readonly IndexDef[];
  readonly _shared: boolean;

  /** Default SELECT type -- excludes hidden columns. */
  readonly $infer: Infer<TColumns>;
  /** All columns including hidden. */
  readonly $infer_all: InferAll<TColumns>;
  /** Insert type -- defaulted columns optional. ALL columns included. */
  readonly $insert: Insert<TColumns>;
  /** Update type -- all non-PK columns optional. ALL columns included. */
  readonly $update: Update<TColumns>;
  /** Excludes sensitive and hidden columns. */
  readonly $not_sensitive: NotSensitive<TColumns>;
  /** Excludes hidden columns. */
  readonly $not_hidden: NotHidden<TColumns>;

  /** Mark this table as shared / cross-tenant. */
  shared(): TableDef<TColumns>;
}

// ---------------------------------------------------------------------------
// Table options
// ---------------------------------------------------------------------------

export interface TableOptions {
  relations?: Record<string, unknown>;
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
    get $not_sensitive(): NotSensitive<TColumns> {
      return undefined as never;
    },
    get $not_hidden(): NotHidden<TColumns> {
      return undefined as never;
    },

    shared() {
      return createTableInternal(name, columns, indexes, true);
    },
  };
  return table;
}
