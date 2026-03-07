import type { RelationDef } from '../schema/relation';
import type { ColumnRecord, TableDef } from '../schema/table';

// ---------------------------------------------------------------------------
// TenantGraph — result of tenant analysis
// ---------------------------------------------------------------------------

export interface TenantGraph {
  /** The tenant root table key (e.g., "organizations"). Null if no tenant declarations exist. */
  readonly root: string | null;
  /** Model keys with a direct { tenant } declaration pointing to the root. */
  readonly directlyScoped: readonly string[];
  /** Model keys reachable from scoped models via relation chains. */
  readonly indirectlyScoped: readonly string[];
  /** Model keys whose tables are marked with .shared(). */
  readonly shared: readonly string[];
}

// ---------------------------------------------------------------------------
// Registry types (subset of what createDb receives)
// ---------------------------------------------------------------------------

interface ModelRegistryEntry {
  readonly table: TableDef<ColumnRecord>;
  readonly relations: Record<string, RelationDef>;
  readonly _tenant?: string | null;
}

type ModelRegistry = Record<string, ModelRegistryEntry>;

// ---------------------------------------------------------------------------
// computeTenantGraph
// ---------------------------------------------------------------------------

/**
 * Analyzes a model registry to compute the tenant scoping graph.
 *
 * Fully relation-derived — reads _tenant from model options and follows
 * relation chains for indirect scoping. Does NOT scan column metadata.
 *
 * 1. Finds the tenant root — the table that tenant relations point to.
 * 2. Classifies models as directly scoped (has { tenant } option),
 *    indirectly scoped (has a relation to a scoped model), or shared (.shared()).
 * 3. Models that are none of the above are unscoped — the caller should
 *    log a notice for those.
 */
export function computeTenantGraph(registry: ModelRegistry): TenantGraph {
  const entries = Object.entries(registry);

  // Build a map of table name -> registry key for lookup
  const tableNameToKey = new Map<string, string>();
  for (const [key, entry] of entries) {
    tableNameToKey.set(entry.table._name, key);
  }

  // Step 1: Find tenant root, directly scoped, and shared models
  let root: string | null = null;
  const directlyScoped: string[] = [];
  const shared: string[] = [];

  for (const [key, entry] of entries) {
    // Check for shared
    if (entry.table._shared) {
      shared.push(key);
      continue;
    }

    // Check for tenant option
    if (entry._tenant) {
      const tenantRel = entry.relations[entry._tenant] as RelationDef | undefined;
      if (!tenantRel) {
        throw new Error(
          `Model "${key}": tenant relation "${entry._tenant}" not found in relations`,
        );
      }
      if (!directlyScoped.includes(key)) {
        directlyScoped.push(key);
      }
      // The referenced table is the tenant root
      const rootTableName = tenantRel._target()._name;
      const rootKey = tableNameToKey.get(rootTableName);
      if (rootKey) {
        if (root !== null && root !== rootKey) {
          throw new Error(
            `Conflicting tenant roots: "${root}" and "${rootKey}". All tenant declarations must point to the same root table.`,
          );
        }
        root = rootKey;
      }
    }
  }

  // Step 2: Find indirectly scoped models via relation chains
  // Build a set of table names that are scoped (root + directly scoped)
  const scopedTableNames = new Set<string>();
  if (root !== null) {
    const rootEntry = registry[root];
    if (rootEntry) {
      scopedTableNames.add(rootEntry.table._name);
    }
  }
  for (const key of directlyScoped) {
    const entry = registry[key];
    if (entry) {
      scopedTableNames.add(entry.table._name);
    }
  }

  const indirectlyScoped: string[] = [];
  const indirectlyScopedNames = new Set<string>();

  // Iteratively resolve indirect scoping until no new models are found
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, entry] of entries) {
      // Skip root, directly scoped, shared, and already indirectly scoped
      if (
        key === root ||
        directlyScoped.includes(key) ||
        shared.includes(key) ||
        indirectlyScopedNames.has(entry.table._name)
      ) {
        continue;
      }

      // Check if any relation targets a scoped or indirectly scoped table
      for (const rel of Object.values(entry.relations)) {
        const targetTableName = (rel as RelationDef)._target()._name;
        if (scopedTableNames.has(targetTableName) || indirectlyScopedNames.has(targetTableName)) {
          indirectlyScoped.push(key);
          indirectlyScopedNames.add(entry.table._name);
          scopedTableNames.add(entry.table._name);
          changed = true;
          break;
        }
      }
    }
  }

  return {
    root,
    directlyScoped,
    indirectlyScoped,
    shared,
  };
}
