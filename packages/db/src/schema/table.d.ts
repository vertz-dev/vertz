import type { ColumnBuilder, ColumnMetadata, InferColumnType } from './column';
import type { RelationDef } from './relation';
export interface IndexDef {
  readonly columns: readonly string[];
}
export declare function createIndex(columns: string | string[]): IndexDef;
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
export interface TableOptions {
  relations?: Record<string, RelationDef>;
  indexes?: IndexDef[];
}
export declare function createTable<TColumns extends ColumnRecord>(
  name: string,
  columns: TColumns,
  options?: TableOptions,
): TableDef<TColumns>;
//# sourceMappingURL=table.d.ts.map
