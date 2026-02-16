/**
 * Relation loader — DB-011.
 *
 * Implements the `include` option for find queries.
 * Uses a batching strategy: after the primary query, loads related
 * rows in separate queries using WHERE id IN (...).
 *
 * Supports:
 * - `include: { relation: true }` — load full relation
 * - `include: { relation: { select: { ... } } }` — load with field narrowing
 * - Nested includes up to depth 2
 * - 'one' relations (return single object)
 * - 'many' relations (return array)
 * - 'many' through join table (many-to-many)
 */
import type { RelationDef } from '../schema/relation';
import type { ColumnRecord, TableDef } from '../schema/table';
import type { QueryFn } from './executor';
export interface IncludeSpec {
  readonly [key: string]:
    | true
    | {
        select?: Record<string, true>;
        include?: IncludeSpec;
      };
}
/**
 * A table entry from the database registry — used for resolving nested includes
 * and manyToMany relations. Mirrors the shape in schema/inference.ts without
 * importing the full type to avoid circular dependencies.
 */
export interface TableRegistryEntry {
  readonly table: TableDef<ColumnRecord>;
  readonly relations: Record<string, RelationDef>;
}
/**
 * Load relations for a set of primary rows.
 *
 * For each included relation:
 * 1. Collect foreign key values from the primary rows
 * 2. Batch-load related rows with WHERE fk IN (...)
 * 3. Attach related rows to primary rows
 *
 * @param queryFn - The query execution function
 * @param primaryRows - The primary query result rows (already camelCase-mapped)
 * @param relations - The relations record from the table entry
 * @param include - The include specification from query options
 * @param depth - Current recursion depth (max 2)
 * @param tablesRegistry - The full table registry for resolving nested/m2m relations
 * @param primaryTable - The primary table definition (for PK resolution)
 */
export declare function loadRelations<T extends Record<string, unknown>>(
  queryFn: QueryFn,
  primaryRows: T[],
  relations: Record<string, RelationDef>,
  include: IncludeSpec,
  depth?: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
  primaryTable?: TableDef<ColumnRecord>,
): Promise<T[]>;
//# sourceMappingURL=relation-loader.d.ts.map
