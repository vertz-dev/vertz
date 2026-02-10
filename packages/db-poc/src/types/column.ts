// ============================================================================
// Layer 1: Column Definition Types
// ============================================================================
// Key optimization: Use interfaces (not type aliases) for aggressive caching.
// Use branded types so TypeScript can short-circuit structural comparisons.
// ============================================================================

/** Visibility levels for columns */
export type Visibility = 'normal' | 'sensitive' | 'hidden';

/** Column metadata - determines nullability, defaults, and visibility */
export interface ColumnMeta {
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly visibility: Visibility;
  readonly isPrimary: boolean;
  readonly isUnique: boolean;
}

/** Default metadata for a new column */
export interface DefaultMeta extends ColumnMeta {
  readonly nullable: false;
  readonly hasDefault: false;
  readonly visibility: 'normal';
  readonly isPrimary: false;
  readonly isUnique: false;
}

/**
 * Core column definition type.
 * TType: the TypeScript type this column maps to
 * TMeta: the column metadata (nullable, hasDefault, visibility, etc.)
 *
 * Optimization: interface with _brand for identity short-circuiting
 */
export interface ColumnDef<TType = unknown, TMeta extends ColumnMeta = ColumnMeta> {
  readonly _brand: 'ColumnDef';
  readonly _type: TType;
  readonly _meta: TMeta;
}

// ============================================================================
// Column Builder Chain Types
// ============================================================================
// Each modifier returns a new ColumnDef with the updated metadata.
// Using mapped types with `Omit & { key: newValue }` pattern instead of
// conditional types to avoid `infer` in the hot path.
// ============================================================================

/** Result of calling .nullable() on a column */
export type WithNullable<T extends ColumnDef> = ColumnDef<
  T['_type'],
  Omit<T['_meta'], 'nullable'> & { readonly nullable: true }
>;

/** Result of calling .default() on a column */
export type WithDefault<T extends ColumnDef> = ColumnDef<
  T['_type'],
  Omit<T['_meta'], 'hasDefault'> & { readonly hasDefault: true }
>;

/** Result of calling .primary() on a column */
export type WithPrimary<T extends ColumnDef> = ColumnDef<
  T['_type'],
  Omit<T['_meta'], 'isPrimary' | 'hasDefault'> & { readonly isPrimary: true; readonly hasDefault: true }
>;

/** Result of calling .sensitive() on a column */
export type WithSensitive<T extends ColumnDef> = ColumnDef<
  T['_type'],
  Omit<T['_meta'], 'visibility'> & { readonly visibility: 'sensitive' }
>;

/** Result of calling .hidden() on a column */
export type WithHidden<T extends ColumnDef> = ColumnDef<
  T['_type'],
  Omit<T['_meta'], 'visibility'> & { readonly visibility: 'hidden' }
>;

/** Result of calling .unique() on a column */
export type WithUnique<T extends ColumnDef> = ColumnDef<
  T['_type'],
  Omit<T['_meta'], 'isUnique'> & { readonly isUnique: true }
>;

// ============================================================================
// Column Builder Interface
// ============================================================================
// Chainable builder that modifies metadata.
// Each method returns a new ColumnBuilder with updated types.
// ============================================================================

export interface ColumnBuilder<TType = unknown, TMeta extends ColumnMeta = DefaultMeta> {
  readonly _brand: 'ColumnDef';
  readonly _type: TType;
  readonly _meta: TMeta;

  nullable(): ColumnBuilder<TType | null, Omit<TMeta, 'nullable'> & { readonly nullable: true }>;
  default(): ColumnBuilder<TType, Omit<TMeta, 'hasDefault'> & { readonly hasDefault: true }>;
  primary(): ColumnBuilder<TType, Omit<TMeta, 'isPrimary' | 'hasDefault'> & { readonly isPrimary: true; readonly hasDefault: true }>;
  sensitive(): ColumnBuilder<TType, Omit<TMeta, 'visibility'> & { readonly visibility: 'sensitive' }>;
  hidden(): ColumnBuilder<TType, Omit<TMeta, 'visibility'> & { readonly visibility: 'hidden' }>;
  unique(): ColumnBuilder<TType, Omit<TMeta, 'isUnique'> & { readonly isUnique: true }>;
}

// ============================================================================
// Type-level helpers to extract info from ColumnDef
// ============================================================================

/** Extract the TypeScript type from a ColumnDef */
export type ColumnType<T extends ColumnDef> = T['_type'];

/** Extract the metadata from a ColumnDef */
export type ColumnMetaOf<T extends ColumnDef> = T['_meta'];

/** Check if a column is nullable */
export type IsNullable<T extends ColumnDef> = T['_meta']['nullable'];

/** Check if a column has a default */
export type HasDefault<T extends ColumnDef> = T['_meta']['hasDefault'];

/** Get the visibility of a column */
export type GetVisibility<T extends ColumnDef> = T['_meta']['visibility'];
