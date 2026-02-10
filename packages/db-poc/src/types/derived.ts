// ============================================================================
// Layer 4: Derived Schema Types
// ============================================================================
// $infer: full row type (resolves column types, respects nullable)
// $insert: omit columns with defaults, make nullable columns optional
// $update: all fields optional (Partial)
// ============================================================================

import type { ColumnDef, ColumnMeta } from './column.js';
import type { TableDef } from './table.js';

// ============================================================================
// $infer — full row type
// ============================================================================
// Maps each column to its resolved TypeScript type.
// Hidden columns are excluded from the inferred type.
// ============================================================================

export type $infer<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : K]: T['_columns'][K]['_type'];
};

// ============================================================================
// $insert — insert payload type
// ============================================================================
// Columns with hasDefault=true are optional.
// Columns with nullable=true are optional.
// All other columns are required.
// Hidden columns are excluded.
//
// Optimization: split into required + optional and intersect.
// Uses mapped type `as` clause instead of conditional infer.
// ============================================================================

/** Keys of columns that are required for insert */
type InsertRequiredKeys<T extends TableDef> = {
  [K in keyof T['_columns']]: T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : T['_columns'][K]['_meta']['hasDefault'] extends true
      ? never
      : T['_columns'][K]['_meta']['nullable'] extends true
        ? never
        : K;
}[keyof T['_columns']];

/** Keys of columns that are optional for insert */
type InsertOptionalKeys<T extends TableDef> = {
  [K in keyof T['_columns']]: T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : T['_columns'][K]['_meta']['hasDefault'] extends true
      ? K
      : T['_columns'][K]['_meta']['nullable'] extends true
        ? K
        : never;
}[keyof T['_columns']];

export type $insert<T extends TableDef> =
  & { [K in InsertRequiredKeys<T>]: T['_columns'][K]['_type'] }
  & { [K in InsertOptionalKeys<T>]?: T['_columns'][K]['_type'] };

// ============================================================================
// $update — update payload type (all fields optional)
// ============================================================================
// All non-hidden columns become optional.
// ============================================================================

export type $update<T extends TableDef> = {
  [K in keyof T['_columns'] as T['_columns'][K]['_meta']['visibility'] extends 'hidden'
    ? never
    : K]?: T['_columns'][K]['_type'];
};
