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
}

// ---------------------------------------------------------------------------
// createModel factory
// ---------------------------------------------------------------------------

export function createModel<
  TTable extends TableDef<ColumnRecord>,
  TRelations extends Record<string, RelationDef> = Record<string, never>,
>(table: TTable, relations?: TRelations): ModelDef<TTable, TRelations> {
  return {
    table,
    relations: (relations ?? {}) as TRelations,
    schemas: deriveSchemas(table),
  };
}
