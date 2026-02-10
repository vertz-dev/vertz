// ============================================================================
// Layer 1: Table and Relation Definition Types
// ============================================================================
// Uses branded interfaces for identity short-circuiting.
// Relations are typed by cardinality and target table name.
// ============================================================================

import type { ColumnDef, ColumnMeta } from './column.js';

// ============================================================================
// Relation Types
// ============================================================================

/** Relation cardinality */
export type RelationType = 'one' | 'many';

/**
 * Relation definition.
 * TType: 'one' or 'many'
 * TTarget: string literal of the target table name
 */
export interface RelationDef<
  TType extends RelationType = RelationType,
  TTarget extends string = string,
> {
  readonly _brand: 'RelationDef';
  readonly _type: TType;
  readonly _target: TTarget;
}

// ============================================================================
// Table Definition
// ============================================================================

/**
 * Core table definition type.
 * TName: string literal name of the table
 * TColumns: record of column name -> ColumnDef
 * TRelations: record of relation name -> RelationDef
 *
 * Optimization: interface with branded name for identity short-circuiting.
 * Pre-computes visibility-filtered column sets eagerly.
 */
export interface TableDef<
  TName extends string = string,
  TColumns extends Record<string, ColumnDef<any, any>> = Record<string, ColumnDef<any, any>>,
  TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
> {
  readonly _brand: 'TableDef';
  readonly _name: TName;
  readonly _columns: TColumns;
  readonly _relations: TRelations;
}

// ============================================================================
// Type-level helpers for TableDef
// ============================================================================

/** Extract table name */
export type TableName<T extends TableDef> = T['_name'];

/** Extract columns record */
export type TableColumns<T extends TableDef> = T['_columns'];

/** Extract relations record */
export type TableRelations<T extends TableDef> = T['_relations'];

// ============================================================================
// Pre-computed visibility filters (EAGER, not lazy)
// ============================================================================
// Optimization: compute filtered column sets ONCE per table, not per query.
// Uses mapped type with `as` clause to filter by visibility without `infer`.
// ============================================================================

/** Columns that are not sensitive (excludes 'sensitive' visibility) */
export type NotSensitiveColumns<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'sensitive' ? never : K]: T['_columns'][K];
};

/** Columns that are not hidden (excludes 'hidden' visibility) */
export type NotHiddenColumns<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'hidden' ? never : K]: T['_columns'][K];
};

/** Only normal-visibility columns */
export type NormalColumns<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'normal' ? K : never]: T['_columns'][K];
};

/** Column keys filtered by visibility */
export type ColumnKeysWithVisibility<
  T extends TableDef,
  V extends 'normal' | 'sensitive' | 'hidden',
> = {
  [K in keyof T['_columns']]: T['_columns'][K]['_meta']['visibility'] extends V ? K : never;
}[keyof T['_columns']];
