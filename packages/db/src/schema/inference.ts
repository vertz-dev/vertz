import type { ColumnBuilder, ColumnMetadata, InferColumnType } from './column';
import type { RelationDef } from './relation';
import type { ColumnRecord, TableDef } from './table';

// ---------------------------------------------------------------------------
// FilterType — typed where filters with operators
// ---------------------------------------------------------------------------

/** Operators available for comparable types (number, string, Date, bigint). */
interface ComparisonOperators<T> {
  readonly eq?: T;
  readonly ne?: T;
  readonly gt?: T;
  readonly gte?: T;
  readonly lt?: T;
  readonly lte?: T;
  readonly in?: readonly T[];
  readonly notIn?: readonly T[];
}

/** Additional operators for string columns. */
interface StringOperators {
  readonly contains?: string;
  readonly startsWith?: string;
  readonly endsWith?: string;
}

/** The `isNull` operator — only available for nullable columns. */
interface NullOperator {
  readonly isNull?: boolean;
}

/**
 * Resolves the filter operators for a single column based on its inferred type
 * and nullable metadata.
 *
 * - All types get comparison + in/notIn
 * - String types additionally get contains, startsWith, endsWith
 * - Nullable columns additionally get isNull
 *
 * Uses [T] extends [string] to prevent union distribution -- ensures that a
 * union like 'admin' | 'editor' keeps the full union in each operator slot.
 */
type ColumnFilterOperators<TType, TNullable extends boolean> = ([TType] extends [string]
  ? ComparisonOperators<TType> & StringOperators
  : ComparisonOperators<TType>) &
  (TNullable extends true ? NullOperator : unknown);

/** Determine whether a column is nullable from its metadata. */
type IsNullable<C> =
  C extends ColumnBuilder<unknown, infer M>
    ? M extends { readonly nullable: true }
      ? true
      : false
    : false;

/**
 * FilterType<TColumns> — typed where clause.
 *
 * Each key maps to either:
 * - A direct value (shorthand for `{ eq: value }`)
 * - An object with typed filter operators
 */
export type FilterType<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]?:
    | InferColumnType<TColumns[K]>
    | ColumnFilterOperators<InferColumnType<TColumns[K]>, IsNullable<TColumns[K]>>;
};

// ---------------------------------------------------------------------------
// OrderByType — constrained to column names with 'asc' | 'desc'
// ---------------------------------------------------------------------------

export type OrderByType<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]?: 'asc' | 'desc';
};

// ---------------------------------------------------------------------------
// SelectOption — mutual exclusivity between `not` and explicit field selection
// ---------------------------------------------------------------------------

/**
 * SelectOption<TColumns> — the `select` field in query options.
 *
 * Either:
 * - `{ not: 'sensitive' | 'hidden' }` — exclude columns by visibility category
 * - `{ [column]: true }` — explicitly pick columns
 *
 * The two forms are mutually exclusive, enforced via `never` mapped keys.
 */
export type SelectOption<TColumns extends ColumnRecord> =
  | ({ readonly not: 'sensitive' | 'hidden' } & { readonly [K in keyof TColumns]?: never })
  | ({ readonly [K in keyof TColumns]?: true } & { readonly not?: never });

// ---------------------------------------------------------------------------
// SelectNarrow — narrows result to selected fields or excludes by visibility
// ---------------------------------------------------------------------------

/** Keys of columns where a given metadata flag is NOT `true`. */
type ColumnKeysWhereNot<T extends ColumnRecord, Flag extends keyof ColumnMetadata> = {
  [K in keyof T]: T[K] extends ColumnBuilder<unknown, infer M>
    ? M extends Record<Flag, true>
      ? never
      : K
    : never;
}[keyof T];

/** Extract selected keys from a select map (keys set to `true`). */
type SelectedKeys<TColumns extends ColumnRecord, TSelect> = {
  [K in keyof TSelect]: K extends keyof TColumns ? (TSelect[K] extends true ? K : never) : never;
}[keyof TSelect];

/**
 * SelectNarrow<TColumns, TSelect> — applies a select clause to narrow the result type.
 *
 * - `{ not: 'sensitive' }` → excludes sensitive AND hidden columns
 * - `{ not: 'hidden' }` → excludes hidden columns
 * - `{ id: true, name: true }` → picks only id and name
 * - `undefined` → default: excludes hidden columns ($infer behavior)
 */
export type SelectNarrow<TColumns extends ColumnRecord, TSelect> = TSelect extends {
  not: 'sensitive';
}
  ? {
      [K in ColumnKeysWhereNot<TColumns, 'sensitive'> &
        ColumnKeysWhereNot<TColumns, 'hidden'> &
        keyof TColumns]: InferColumnType<TColumns[K]>;
    }
  : TSelect extends { not: 'hidden' }
    ? {
        [K in ColumnKeysWhereNot<TColumns, 'hidden'> & keyof TColumns]: InferColumnType<
          TColumns[K]
        >;
      }
    : TSelect extends Record<string, true | undefined>
      ? {
          [K in SelectedKeys<TColumns, TSelect> & keyof TColumns]: InferColumnType<TColumns[K]>;
        }
      : {
          [K in ColumnKeysWhereNot<TColumns, 'hidden'> & keyof TColumns]: InferColumnType<
            TColumns[K]
          >;
        };

// ---------------------------------------------------------------------------
// IncludeResolve — resolves relation includes with depth cap
// ---------------------------------------------------------------------------

/** Relations record — maps relation names to RelationDef. */
type RelationsRecord = Record<string, RelationDef>;

/**
 * The shape of include options for a given relations record.
 * Each relation can be:
 * - `true` — include with default fields
 * - An object with optional `select` clause for narrowing
 */
export type IncludeOption<TRelations extends RelationsRecord> = {
  [K in keyof TRelations]?: true | { select?: Record<string, true> };
};

/** Extract the target table from a RelationDef. */
type RelationTarget<R> = R extends RelationDef<infer TTarget, 'one' | 'many'> ? TTarget : never;

/** Extract the relation type ('one' | 'many') from a RelationDef. */
type RelationType<R> = R extends RelationDef<TableDef<ColumnRecord>, infer TType> ? TType : never;

/**
 * Resolve a single included relation.
 * - 'one' relations return a single object
 * - 'many' relations return an array
 * - When a `select` sub-clause is provided, the result is narrowed
 */
type ResolveOneInclude<
  R extends RelationDef,
  TIncludeValue,
  _Depth extends readonly unknown[] = [],
> = TIncludeValue extends { select: infer TSubSelect }
  ? RelationTarget<R> extends TableDef<infer TCols>
    ? SelectNarrow<TCols, TSubSelect>
    : never
  : RelationTarget<R> extends TableDef<infer TCols>
    ? SelectNarrow<TCols, undefined>
    : never;

/**
 * IncludeResolve<TRelations, TInclude, Depth> — resolves all included relations.
 *
 * Depth is tracked using a tuple counter. Default cap = 2.
 */
export type IncludeResolve<
  TRelations extends RelationsRecord,
  TInclude,
  _Depth extends readonly unknown[] = [],
> = _Depth['length'] extends 3
  ? unknown
  : {
      [K in keyof TInclude as K extends keyof TRelations
        ? TInclude[K] extends false | undefined
          ? never
          : K
        : never]: K extends keyof TRelations
        ? RelationType<TRelations[K]> extends 'many'
          ? ResolveOneInclude<TRelations[K], TInclude[K], _Depth>[]
          : ResolveOneInclude<TRelations[K], TInclude[K], _Depth>
        : never;
    };

// ---------------------------------------------------------------------------
// FindResult — the return type of queries
// ---------------------------------------------------------------------------

/** Query options shape used by FindResult. */
export interface FindOptions<
  TColumns extends ColumnRecord = ColumnRecord,
  TRelations extends RelationsRecord = RelationsRecord,
> {
  select?: SelectOption<TColumns>;
  include?: IncludeOption<TRelations>;
  where?: FilterType<TColumns>;
  orderBy?: OrderByType<TColumns>;
}

/**
 * FindResult<TTable, TOptions> — the return type of a typed query.
 *
 * Combines:
 * - SelectNarrow for column selection
 * - IncludeResolve for relation includes
 *
 * TOptions is structurally typed (not constrained to FindOptions) so that
 * literal option objects flow through without widening.
 */
export type FindResult<
  TTable extends TableDef<ColumnRecord>,
  TOptions = unknown,
  TRelations extends RelationsRecord = RelationsRecord,
> =
  TTable extends TableDef<infer TColumns>
    ? SelectNarrow<TColumns, TOptions extends { select: infer S } ? S : undefined> &
        (TOptions extends { include: infer I } ? IncludeResolve<TRelations, I> : unknown)
    : never;

// ---------------------------------------------------------------------------
// InsertInput / UpdateInput — standalone type utilities
// ---------------------------------------------------------------------------

/**
 * InsertInput<TTable> — standalone insert type utility.
 * Makes columns with defaults optional, all others required.
 */
export type InsertInput<TTable extends TableDef<ColumnRecord>> = TTable['$insert'];

/**
 * UpdateInput<TTable> — standalone update type utility.
 * All non-PK columns, all optional.
 */
export type UpdateInput<TTable extends TableDef<ColumnRecord>> = TTable['$update'];

// ---------------------------------------------------------------------------
// Database — type that carries the full table registry
// ---------------------------------------------------------------------------

/** A table entry in the database registry, pairing a table with its relations. */
export interface TableEntry<
  TTable extends TableDef<ColumnRecord> = TableDef<ColumnRecord>,
  TRelations extends RelationsRecord = RelationsRecord,
> {
  readonly table: TTable;
  readonly relations: TRelations;
}

/**
 * Database<TTables> — type that carries the full table registry.
 *
 * Used as the foundation for typed query methods (implemented in later tickets).
 * Provides type-safe access to table definitions and their relations.
 */
export interface Database<TTables extends Record<string, TableEntry> = Record<string, TableEntry>> {
  readonly _tables: TTables;
}
