/**
 * Database Adapter Types for @vertz/db
 *
 * Generic adapter interface that abstracts database operations.
 * Implemented by SQLite, D1, and other database adapters.
 */

import type { FilterType, IncludeOption, ModelEntry, OrderByType } from '../schema/inference';
import type { ColumnRecord, TableDef } from '../schema/table';

// ---------------------------------------------------------------------------
// Include entry — structural type for relation include values
// ---------------------------------------------------------------------------

/** A single include entry with optional query constraints. */
export interface AdapterIncludeEntry {
  select?: Record<string, true>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  include?: Record<string, unknown>;
}

/** Include specification: maps relation names to `true` or structured entries. */
export type AdapterIncludeSpec = Record<string, true | AdapterIncludeEntry>;

// ---------------------------------------------------------------------------
// Typed query helpers — conditional on whether TEntry is parameterized
// ---------------------------------------------------------------------------

/**
 * Resolves the where clause type for a given entry.
 * When TEntry is the default (unparameterized), falls back to Record<string, unknown>.
 */
type ResolveWhere<TEntry extends ModelEntry> =
  TEntry extends ModelEntry<infer TTable>
    ? TTable extends TableDef<infer TCols>
      ? [ColumnRecord] extends [TCols]
        ? Record<string, unknown>
        : FilterType<TCols>
      : Record<string, unknown>
    : Record<string, unknown>;

/**
 * Resolves the orderBy type for a given entry.
 * When TEntry is the default (unparameterized), falls back to Record<string, 'asc' | 'desc'>.
 */
type ResolveOrderBy<TEntry extends ModelEntry> =
  TEntry extends ModelEntry<infer TTable>
    ? TTable extends TableDef<infer TCols>
      ? [ColumnRecord] extends [TCols]
        ? Record<string, 'asc' | 'desc'>
        : OrderByType<TCols>
      : Record<string, 'asc' | 'desc'>
    : Record<string, 'asc' | 'desc'>;

/**
 * Resolves the include type for a given entry.
 * When TEntry is the default (unparameterized), falls back to AdapterIncludeSpec.
 */
type ResolveInclude<TEntry extends ModelEntry> =
  TEntry extends ModelEntry<TableDef<ColumnRecord>, infer TRels>
    ? [Record<string, never>] extends [TRels]
      ? AdapterIncludeSpec
      : IncludeOption<TRels>
    : AdapterIncludeSpec;

// ---------------------------------------------------------------------------
// List Options - pagination & filtering
// ---------------------------------------------------------------------------

export interface ListOptions<TEntry extends ModelEntry = ModelEntry> {
  where?: ResolveWhere<TEntry>;
  orderBy?: ResolveOrderBy<TEntry>;
  limit?: number;
  /** Cursor-based pagination: fetch records after this ID. */
  after?: string;
  /** Relation include specification for relation loading. */
  include?: ResolveInclude<TEntry>;
}

/** Options for get-by-id operations. */
export interface GetOptions<TEntry extends ModelEntry = ModelEntry> {
  /** Relation include specification for relation loading. */
  include?: ResolveInclude<TEntry>;
}

// ---------------------------------------------------------------------------
// DB Adapter Interface - abstracts the actual database operations
// ---------------------------------------------------------------------------

export interface EntityDbAdapter<TEntry extends ModelEntry = ModelEntry> {
  get(id: string, options?: GetOptions<TEntry>): Promise<TEntry['table']['$response'] | null>;

  list(
    options?: ListOptions<TEntry>,
  ): Promise<{ data: TEntry['table']['$response'][]; total: number }>;

  create(data: TEntry['table']['$create_input']): Promise<TEntry['table']['$response']>;

  update(id: string, data: TEntry['table']['$update_input']): Promise<TEntry['table']['$response']>;

  delete(id: string): Promise<TEntry['table']['$response'] | null>;
}
