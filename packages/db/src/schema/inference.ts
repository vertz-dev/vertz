import type { DialectName } from '../dialect/types';
import type { ColumnBuilder, InferColumnType } from './column';
import type { JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS } from './jsonb-filter-brand';
import type { RelationDef } from './relation';
import type {
  AllAnnotations,
  ColumnKeysWithoutAnyAnnotation,
  ColumnRecord,
  TableDef,
} from './table';

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
 * Extract column keys whose underlying SQL type is `'jsonb'` or `'json'`.
 * Used to synthesize path-shaped filter keys (`'col->field'`) on Postgres.
 */
type JsonbColumnKeys<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]: TColumns[K] extends ColumnBuilder<unknown, infer M>
    ? M extends { readonly sqlType: 'jsonb' } | { readonly sqlType: 'json' }
      ? K & string
      : never
    : never;
}[keyof TColumns];

/**
 * Path-shaped JSONB key template like `'meta->displayName'`.
 * Resolves to `never` when there are no JSONB columns, preserving the
 * strict key set of `FilterType`.
 */
type JsonbPathKey<TColumns extends ColumnRecord> =
  `${JsonbColumnKeys<TColumns>}->${string}`;

/**
 * Value type for a path-shaped JSONB key. Postgres admits an untyped operand
 * (the payload `T` can't be statically resolved without a typed path builder;
 * follow-up in #2868). Other dialects resolve to a keyed-never brand whose
 * key name IS the recovery sentence — TypeScript's excess-property check
 * quotes the key verbatim in diagnostics.
 */
type JsonbPathValue<TDialect extends DialectName> = TDialect extends 'postgres'
  ? ComparisonOperators<unknown> | string | number | boolean | null
  : JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS;

/**
 * FilterType<TColumns, TDialect> — typed where clause, dialect-conditional.
 *
 * Each key is one of:
 * - A column name mapping to a value (shorthand for `{ eq: value }`) or
 *   an object with typed filter operators.
 * - A path-shaped JSONB key (`'meta->field'`) on Postgres. On SQLite the
 *   same key accepts only a keyed-never brand whose name reads as the
 *   recovery sentence, so assigning `{ 'meta->k': { eq: 'v' } }` fails
 *   with that sentence in the diagnostic.
 *
 * Array operators (`arrayContains`, etc.) are runtime-only today and not
 * yet part of the TS surface — tracked as a follow-up in #2868.
 */
export type FilterType<
  TColumns extends ColumnRecord,
  TDialect extends DialectName = DialectName,
> = {
  [K in keyof TColumns | JsonbPathKey<TColumns>]?: K extends keyof TColumns
    ?
        | InferColumnType<TColumns[K]>
        | ColumnFilterOperators<InferColumnType<TColumns[K]>, IsNullable<TColumns[K]>>
    : JsonbPathValue<TDialect>;
};

// ---------------------------------------------------------------------------
// OrderByType — constrained to column names with 'asc' | 'desc'
// ---------------------------------------------------------------------------

export type OrderByType<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]?: 'asc' | 'desc';
};

// ---------------------------------------------------------------------------
// NumericColumnKeys — column keys whose inferred type is number or bigint
// ---------------------------------------------------------------------------

/**
 * Extract column keys whose inferred type extends `number | bigint`.
 *
 * Used to restrict _avg and _sum aggregation fields to numeric columns.
 * Matches: d.integer(), d.real(), d.doublePrecision(), d.serial(), d.bigint()
 * Excludes: d.text(), d.uuid(), d.boolean(), d.timestamp(), d.decimal() (string), d.jsonb(), etc.
 */
export type NumericColumnKeys<TColumns extends ColumnRecord> = {
  [K in keyof TColumns]: NonNullable<InferColumnType<TColumns[K]>> extends number | bigint
    ? K
    : never;
}[keyof TColumns] &
  string;

// ---------------------------------------------------------------------------
// SelectOption — mutual exclusivity between `not` and explicit field selection
// ---------------------------------------------------------------------------

/**
 * SelectOption<TColumns> — the `select` field in query options.
 *
 * Either:
 * - `{ not: Annotation | Annotation[] }` — exclude columns by annotation(s)
 * - `{ [column]: true }` — explicitly pick columns
 *
 * The two forms are mutually exclusive, enforced via `never` mapped keys.
 */
export type SelectOption<TColumns extends ColumnRecord> =
  | ({
      readonly not: AllAnnotations<TColumns> | readonly AllAnnotations<TColumns>[];
    } & { readonly [K in keyof TColumns]?: never })
  | ({ readonly [K in keyof TColumns]?: true } & { readonly not?: never });

// ---------------------------------------------------------------------------
// SelectNarrow — narrows result to selected fields or excludes by visibility
// ---------------------------------------------------------------------------

/** Extract selected keys from a select map (keys set to `true`). */
type SelectedKeys<TColumns extends ColumnRecord, TSelect> = {
  [K in keyof TSelect]: K extends keyof TColumns ? (TSelect[K] extends true ? K : never) : never;
}[keyof TSelect];

/**
 * Normalize `not` value to a union of annotation strings.
 * - `'annotation'` → `'annotation'`
 * - `readonly ['a', 'b']` → `'a' | 'b'`
 */
type NormalizeAnnotations<T> = T extends readonly (infer F)[]
  ? F extends string
    ? F
    : never
  : T extends string
    ? T
    : never;

/**
 * SelectNarrow<TColumns, TSelect> — applies a select clause to narrow the result type.
 *
 * - `{ not: 'sensitive' }` → excludes 'sensitive'-annotated AND 'hidden'-annotated columns
 * - `{ not: ['sensitive', 'patchable'] }` → excludes columns with ANY listed annotation + 'hidden'
 * - `{ id: true, name: true }` → picks only id and name
 * - `undefined` → default: excludes 'hidden'-annotated columns ($infer behavior)
 */
export type SelectNarrow<TColumns extends ColumnRecord, TSelect> = TSelect extends {
  not: infer TNot;
}
  ? {
      [K in ColumnKeysWithoutAnyAnnotation<TColumns, NormalizeAnnotations<TNot> | 'hidden'> &
        keyof TColumns]: InferColumnType<TColumns[K]>;
    }
  : TSelect extends Record<string, true | undefined>
    ? {
        [K in SelectedKeys<TColumns, TSelect> & keyof TColumns]: InferColumnType<TColumns[K]>;
      }
    : {
        [K in ColumnKeysWithoutAnyAnnotation<TColumns, 'hidden'> & keyof TColumns]: InferColumnType<
          TColumns[K]
        >;
      };

// ---------------------------------------------------------------------------
// IncludeResolve — resolves relation includes with depth cap
// ---------------------------------------------------------------------------

/** Relations record — maps relation names to RelationDef. */
type RelationsRecord = Record<string, RelationDef>;

/**
 * Find a ModelEntry in the registry by matching its table type.
 * Returns `never` if no match is found.
 *
 * Uses bidirectional extends check to prevent false positives from
 * structural subtyping. In practice, `TableDef<TColumns>` types are
 * unique because each table has a distinct column record.
 */
export type FindModelByTable<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
> = {
  [K in keyof TModels]: TModels[K]['table'] extends TTable
    ? TTable extends TModels[K]['table']
      ? TModels[K]
      : never
    : never;
}[keyof TModels];

/**
 * Extract the relations record from the ModelEntry matching a table.
 * Returns empty record if no match found.
 */
export type FindModelRelations<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
> = [FindModelByTable<TModels, TTable>] extends [never]
  ? {}
  : FindModelByTable<TModels, TTable> extends ModelEntry<infer _T, infer TRels>
    ? TRels
    : {};

/**
 * Resolve nested include type. When the target model is found in the registry,
 * produces a typed IncludeOption. Otherwise falls back to Record<string, unknown>.
 *
 * Uses `[X] extends [never]` (tuple wrapper) to prevent distribution over `never`.
 *
 * The explicit `never` check falls back to `Record<string, unknown>` (permissive)
 * rather than letting `FindModelRelations` return `{}` (which would produce an
 * empty typed map that rejects all keys). The untyped fallback is intentional for
 * the "model not found in registry" case.
 */
type NestedInclude<
  TModels extends Record<string, ModelEntry>,
  TTable extends TableDef<ColumnRecord>,
  TDialect extends DialectName,
  _Depth extends readonly unknown[],
> = [FindModelByTable<TModels, TTable>] extends [never]
  ? Record<string, unknown>
  : IncludeOption<FindModelRelations<TModels, TTable>, TModels, TDialect, [..._Depth, unknown]>;

/**
 * The shape of include options for a given relations record.
 * Each relation can be:
 * - `true` — include with default fields
 * - An object with `select`, `where`, `orderBy`, `limit` constrained to target columns,
 *   and optionally `include` for nested relation includes (typed when TModels is provided)
 *
 * When `TModels` is not provided (default), nested `include` falls back to
 * `Record<string, unknown>` for backward compatibility.
 *
 * Depth cap: 3 typed nesting levels (depth indices 0, 1, 2). A 4th nesting level
 * (depth index 3, tuple length 3) falls back to untyped Record<string, unknown>.
 * This matches the existing IncludeResolve cap.
 */
export type IncludeOption<
  TRelations extends RelationsRecord,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
  TDialect extends DialectName = DialectName,
  _Depth extends readonly unknown[] = [],
> = _Depth['length'] extends 3
  ? Record<string, unknown>
  : {
      [K in keyof TRelations]?:
        | true
        | (RelationTarget<TRelations[K]> extends TableDef<infer TCols>
            ? {
                select?: { [C in keyof TCols]?: true };
                where?: FilterType<TCols, TDialect>;
                orderBy?: OrderByType<TCols>;
                limit?: number;
                include?: NestedInclude<TModels, RelationTarget<TRelations[K]>, TDialect, _Depth>;
              }
            : never);
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
 * - When a nested `include` is provided and TModels is available, the result
 *   includes recursively resolved nested relation data
 */
type ResolveOneInclude<
  R extends RelationDef,
  TIncludeValue,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
  _Depth extends readonly unknown[] = [],
> =
  RelationTarget<R> extends TableDef<infer TCols>
    ? (TIncludeValue extends { select: infer TSubSelect }
        ? SelectNarrow<TCols, TSubSelect>
        : SelectNarrow<TCols, undefined>) &
        (TIncludeValue extends { include: infer TNestedInclude }
          ? IncludeResolve<
              FindModelRelations<TModels, RelationTarget<R>>,
              TNestedInclude,
              TModels,
              [..._Depth, unknown]
            >
          : unknown)
    : never;

/**
 * IncludeResolve<TRelations, TInclude, TModels, Depth> — resolves all included relations.
 *
 * Depth is tracked using a tuple counter. Cap at 3 (tuple lengths 0, 1, 2 are typed;
 * length 3 falls back to unknown).
 */
export type IncludeResolve<
  TRelations extends RelationsRecord,
  TInclude,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
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
          ? ResolveOneInclude<TRelations[K], TInclude[K], TModels, _Depth>[]
          : ResolveOneInclude<TRelations[K], TInclude[K], TModels, _Depth>
        : never;
    };

// ---------------------------------------------------------------------------
// FindResult — the return type of queries
// ---------------------------------------------------------------------------

/** Query options shape used by FindResult. */
export interface FindOptions<
  TColumns extends ColumnRecord = ColumnRecord,
  TRelations extends RelationsRecord = RelationsRecord,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
  TDialect extends DialectName = DialectName,
> {
  select?: SelectOption<TColumns>;
  include?: IncludeOption<TRelations, TModels, TDialect>;
  where?: FilterType<TColumns, TDialect>;
  orderBy?: OrderByType<TColumns>;
}

/**
 * FindResult<TTable, TOptions, TRelations, TModels> — the return type of a typed query.
 *
 * Combines:
 * - SelectNarrow for column selection
 * - IncludeResolve for relation includes (with nested resolution when TModels is provided)
 *
 * TOptions is structurally typed (not constrained to FindOptions) so that
 * literal option objects flow through without widening.
 */
export type FindResult<
  TTable extends TableDef<ColumnRecord>,
  TOptions = unknown,
  TRelations extends RelationsRecord = RelationsRecord,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> =
  TTable extends TableDef<infer TColumns>
    ? SelectNarrow<TColumns, TOptions extends { select: infer S } ? S : undefined> &
        (TOptions extends { include: infer I } ? IncludeResolve<TRelations, I, TModels> : unknown)
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
// Database — type that carries the full model registry
// ---------------------------------------------------------------------------

/** A model entry in the database registry, pairing a table with its relations. */
export interface ModelEntry<
  TTable extends TableDef<ColumnRecord> = TableDef<ColumnRecord>,
  TRelations extends RelationsRecord = RelationsRecord,
> {
  readonly table: TTable;
  readonly relations: TRelations;
}

/**
 * Database<TModels> — type that carries the full model registry.
 *
 * Used as the foundation for typed query methods (implemented in later tickets).
 * Provides type-safe access to table definitions and their relations.
 */
export interface Database<TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>> {
  readonly _models: TModels;
}
