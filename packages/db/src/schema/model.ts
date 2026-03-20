/**
 * ModelDef — pairs a table definition with its relations and derived schemas.
 *
 * Replaces the previous `TableEntry` + `createRegistry()` pattern with a single
 * unified concept. The model carries everything the entity system (Phase 3+) needs:
 * the table, its relations, and parse-compatible schema objects for API operations.
 */

import type { ModelSchemas } from './model-schemas';
import { deriveSchemas } from './model-schemas';
import type { RelationDef } from './relation';
import type { ColumnRecord, TableDef } from './table';

// ---------------------------------------------------------------------------
// ModelDef interface
// ---------------------------------------------------------------------------

export interface ModelDef<
  TTable extends TableDef<ColumnRecord> = TableDef<ColumnRecord>,
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty relations record — the correct default for models without relations
  TRelations extends Record<string, RelationDef> = {},
> {
  readonly table: TTable;
  readonly relations: TRelations;
  readonly schemas: ModelSchemas<TTable>;
  readonly _tenant: string | null;
}

// ---------------------------------------------------------------------------
// ModelOptions — optional config for d.model()
// ---------------------------------------------------------------------------

export interface ModelOptions<TRelations extends Record<string, RelationDef>> {
  /**
   * The relation that defines the tenant boundary for this model.
   * Must reference a key in the relations record. The referenced relation's
   * target table is the tenant root.
   */
  readonly tenant?: Extract<keyof TRelations, string>;
}

// ---------------------------------------------------------------------------
// ValidateOneRelationFKs — ensures ref.one() foreign keys exist on source table
// ---------------------------------------------------------------------------

export type ValidateOneRelationFKs<
  TTable extends TableDef<ColumnRecord>,
  TRelations extends Record<string, RelationDef>,
> = {
  [K in keyof TRelations]: TRelations[K] extends RelationDef<infer T, 'one', infer FK>
    ? FK extends Extract<keyof TTable['_columns'], string>
      ? TRelations[K]
      : RelationDef<T, 'one', Extract<keyof TTable['_columns'], string>>
    : TRelations[K];
};

// ---------------------------------------------------------------------------
// createModel factory
// ---------------------------------------------------------------------------

export function createModel<
  TTable extends TableDef<ColumnRecord>,
  TRelations extends Record<string, RelationDef> = Record<string, never>,
>(
  table: TTable,
  relations?: TRelations & ValidateOneRelationFKs<TTable, TRelations>,
  options?: ModelOptions<TRelations>,
): ModelDef<TTable, TRelations> {
  return {
    table,
    relations: (relations ?? {}) as TRelations,
    schemas: deriveSchemas(table),
    _tenant: options?.tenant ?? null,
  };
}
