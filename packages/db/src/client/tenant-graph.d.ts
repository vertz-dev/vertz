import type { ColumnRecord, TableDef } from '../schema/table';
export interface TenantGraph {
  /** The tenant root table name (e.g., "organizations"). Null if no tenant columns exist. */
  readonly root: string | null;
  /** Tables with a direct d.tenant() column pointing to the root. */
  readonly directlyScoped: readonly string[];
  /** Tables reachable from directly scoped tables via .references() chains. */
  readonly indirectlyScoped: readonly string[];
  /** Tables marked with .shared(). */
  readonly shared: readonly string[];
}
interface TableRegistryEntry {
  readonly table: TableDef<ColumnRecord>;
  readonly relations: Record<string, unknown>;
}
type TableRegistry = Record<string, TableRegistryEntry>;
/**
 * Analyzes a table registry to compute the tenant scoping graph.
 *
 * 1. Finds the tenant root — the table that tenant columns point to.
 * 2. Classifies tables as directly scoped (has d.tenant()), indirectly scoped
 *    (references a scoped table via .references()), or shared (.shared()).
 * 3. Tables that are none of the above are unscoped — the caller should
 *    log a notice for those.
 */
export declare function computeTenantGraph(registry: TableRegistry): TenantGraph;
//# sourceMappingURL=tenant-graph.d.ts.map
