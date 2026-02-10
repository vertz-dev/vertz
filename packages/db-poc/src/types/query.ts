// ============================================================================
// Layer 3: Query Result Types (THE CRITICAL PATH)
// ============================================================================
// This is where the type instantiation budget is most at risk.
// Key optimizations:
// 1. No `infer` in the hot path -- use mapped types with `as` clause
// 2. Cap relation depth at 2 (each level roughly doubles instantiations)
// 3. Use interfaces for intermediate shapes
// 4. Pre-computed visibility filters from table.ts
// ============================================================================

import type { ColumnDef } from './column.js';
import type { TableDef, RelationDef, NotSensitiveColumns } from './table.js';

// ============================================================================
// Database Registry -- maps table names to TableDefs
// ============================================================================

export type DatabaseSchema = Record<string, TableDef>;

// ============================================================================
// WhereClause -- constrains query by column values
// ============================================================================
// Supports basic equality for each column.
// Optimization: only generates keys for non-hidden columns.
// ============================================================================

export type WhereClause<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : K]?: T['_columns'][K]['_type'] | null;
};

// ============================================================================
// SelectClause -- narrows returned columns
// ============================================================================
// An array of column names to include in the result.
// ============================================================================

export type SelectClause<T extends TableDef> = ReadonlyArray<
  keyof T['_columns'] & string
>;

// ============================================================================
// IncludeClause -- eagerly loads relations
// ============================================================================
// Maps relation names to boolean or nested options.
// Depth is capped at 2 levels.
// ============================================================================

/** Level 2 include: just select columns, no deeper nesting */
export type IncludeClauseL2<TSchema extends DatabaseSchema, T extends TableDef> = {
  [K in keyof T['_relations']]?:
    | true
    | {
        select?: T['_relations'][K]['_target'] extends keyof TSchema
          ? SelectClause<TSchema[T['_relations'][K]['_target']]>
          : never;
      };
};

/** Level 1 include: can nest one more level */
export type IncludeClause<TSchema extends DatabaseSchema, T extends TableDef> = {
  [K in keyof T['_relations']]?:
    | true
    | {
        select?: T['_relations'][K]['_target'] extends keyof TSchema
          ? SelectClause<TSchema[T['_relations'][K]['_target']]>
          : never;
        include?: T['_relations'][K]['_target'] extends keyof TSchema
          ? IncludeClauseL2<TSchema, TSchema[T['_relations'][K]['_target']]>
          : never;
      };
};

// ============================================================================
// OrderByClause
// ============================================================================

export type OrderByClause<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : K]?: 'asc' | 'desc';
};

// ============================================================================
// VisibilityFilter -- `{ not: 'sensitive' }` support
// ============================================================================

export type VisibilityFilter = { not: 'sensitive' } | { not: 'hidden' };

// ============================================================================
// FindOptions -- what the developer passes to db.find()
// ============================================================================

export interface FindOptions<
  TSchema extends DatabaseSchema,
  T extends TableDef,
> {
  where?: WhereClause<T>;
  select?: SelectClause<T>;
  include?: IncludeClause<TSchema, T>;
  orderBy?: OrderByClause<T>;
  visibility?: VisibilityFilter;
}

// ============================================================================
// FindResult -- resolves the return type based on options
// ============================================================================
// Strategy:
// 1. Start with all non-hidden columns
// 2. If `select` is provided, narrow to selected columns only
// 3. If `visibility: { not: 'sensitive' }`, filter out sensitive columns
// 4. If `include` is provided, add relation data
//
// Optimization: each step is a simple mapped type, no conditional chains.
// ============================================================================

/** Resolve column types for a table (base row, excluding hidden) */
type BaseRow<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : K]: T['_columns'][K]['_type'];
};

/** Narrow a row type to only selected columns */
type SelectedRow<T extends TableDef, TSelect extends ReadonlyArray<string>> = {
  [K in TSelect[number] & keyof T['_columns']]: T['_columns'][K]['_type'];
};

/** Filter out sensitive columns from a row */
type NotSensitiveRow<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'sensitive' | 'hidden'
    ? never
    : K]: T['_columns'][K]['_type'];
};

/** Resolve a single included relation at the leaf level (no deeper nesting) */
type ResolveRelationL2<
  TSchema extends DatabaseSchema,
  TRel extends RelationDef,
  TOpts,
> = TRel['_target'] extends keyof TSchema
  ? TOpts extends { select: infer S extends ReadonlyArray<string> }
    ? TRel['_type'] extends 'one'
      ? SelectedRow<TSchema[TRel['_target']], S> | null
      : SelectedRow<TSchema[TRel['_target']], S>[]
    : TRel['_type'] extends 'one'
      ? BaseRow<TSchema[TRel['_target']]> | null
      : BaseRow<TSchema[TRel['_target']]>[]
  : never;

/** Resolve a single included relation at L1 (can have nested includes) */
type ResolveRelationL1<
  TSchema extends DatabaseSchema,
  TRel extends RelationDef,
  TOpts,
> = TRel['_target'] extends keyof TSchema
  ? TOpts extends { select: infer S extends ReadonlyArray<string> }
    ? TOpts extends { include: infer Inc }
      ? TRel['_type'] extends 'one'
        ? (SelectedRow<TSchema[TRel['_target']], S> & ResolveIncludesL2<TSchema, TSchema[TRel['_target']], Inc>) | null
        : (SelectedRow<TSchema[TRel['_target']], S> & ResolveIncludesL2<TSchema, TSchema[TRel['_target']], Inc>)[]
      : TRel['_type'] extends 'one'
        ? SelectedRow<TSchema[TRel['_target']], S> | null
        : SelectedRow<TSchema[TRel['_target']], S>[]
    : TOpts extends { include: infer Inc }
      ? TRel['_type'] extends 'one'
        ? (BaseRow<TSchema[TRel['_target']]> & ResolveIncludesL2<TSchema, TSchema[TRel['_target']], Inc>) | null
        : (BaseRow<TSchema[TRel['_target']]> & ResolveIncludesL2<TSchema, TSchema[TRel['_target']], Inc>)[]
      : TRel['_type'] extends 'one'
        ? BaseRow<TSchema[TRel['_target']]> | null
        : BaseRow<TSchema[TRel['_target']]>[]
  : never;

/** Resolve all L2 includes (leaf level, no deeper nesting) */
type ResolveIncludesL2<
  TSchema extends DatabaseSchema,
  T extends TableDef,
  TInc,
> = {
  [K in keyof TInc & keyof T['_relations']]: TInc[K] extends true
    ? T['_relations'][K]['_target'] extends keyof TSchema
      ? T['_relations'][K]['_type'] extends 'one'
        ? BaseRow<TSchema[T['_relations'][K]['_target']]> | null
        : BaseRow<TSchema[T['_relations'][K]['_target']]>[]
      : never
    : TInc[K] extends object
      ? ResolveRelationL2<TSchema, T['_relations'][K], TInc[K]>
      : never;
};

/** Resolve all L1 includes */
type ResolveIncludesL1<
  TSchema extends DatabaseSchema,
  T extends TableDef,
  TInc,
> = {
  [K in keyof TInc & keyof T['_relations']]: TInc[K] extends true
    ? T['_relations'][K]['_target'] extends keyof TSchema
      ? T['_relations'][K]['_type'] extends 'one'
        ? BaseRow<TSchema[T['_relations'][K]['_target']]> | null
        : BaseRow<TSchema[T['_relations'][K]['_target']]>[]
      : never
    : TInc[K] extends object
      ? ResolveRelationL1<TSchema, T['_relations'][K], TInc[K]>
      : never;
};

// ============================================================================
// FindResult -- the main result type resolver
// ============================================================================
// Determines the shape of the returned data based on FindOptions.
// Step 1: Determine base columns (select or all non-hidden)
// Step 2: Apply visibility filter if present
// Step 3: Add included relations
// ============================================================================

export type FindResult<
  TSchema extends DatabaseSchema,
  T extends TableDef,
  TOpts extends FindOptions<TSchema, T>,
> =
  // Step 1+2: Determine column shape
  (TOpts extends { select: infer S extends ReadonlyArray<string> }
    ? TOpts extends { visibility: { not: 'sensitive' } }
      ? { [K in S[number] & keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'sensitive' ? never : K]: T['_columns'][K]['_type'] }
      : SelectedRow<T, S>
    : TOpts extends { visibility: { not: 'sensitive' } }
      ? NotSensitiveRow<T>
      : BaseRow<T>
  )
  // Step 3: Add includes if present
  & (TOpts extends { include: infer Inc }
    ? ResolveIncludesL1<TSchema, T, Inc>
    : unknown);
