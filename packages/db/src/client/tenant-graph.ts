import type { RelationDef } from '../schema/relation';
import type { ColumnRecord, TableDef } from '../schema/table';

// ---------------------------------------------------------------------------
// TenantGraph — result of tenant analysis
// ---------------------------------------------------------------------------

export interface TenantGraph {
  /** The tenant root table key (e.g., "organizations"). Null if no tenant declarations exist. */
  readonly root: string | null;
  /** Model keys with a ref.one relation to the tenant root table. */
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
}

type ModelRegistry = Record<string, ModelRegistryEntry>;

// ---------------------------------------------------------------------------
// computeTenantGraph
// ---------------------------------------------------------------------------

/**
 * Analyzes a model registry to compute the tenant scoping graph.
 *
 * Fully derived from table metadata and relations:
 *
 * 1. Finds the tenant root — the table with `._tenant === true`.
 * 2. Finds directly scoped models — those with a `ref.one` targeting the root.
 * 3. Finds indirectly scoped models — those reachable from scoped models via
 *    relation chains.
 * 4. Finds shared models — those whose tables are marked `.shared()`.
 * 5. Models that are none of the above are unscoped — the caller should
 *    log a notice for those.
 */
export function computeTenantGraph(registry: ModelRegistry): TenantGraph {
  const entries = Object.entries(registry);

  // Build a map of table name -> registry key for lookup
  const tableNameToKey = new Map<string, string>();
  for (const [key, entry] of entries) {
    tableNameToKey.set(entry.table._name, key);
  }

  // Step 1: Find tenant root and shared tables
  let root: string | null = null;
  const shared: string[] = [];

  for (const [key, entry] of entries) {
    if (entry.table._shared && entry.table._tenant) {
      throw new Error(
        `Table "${entry.table._name}" is marked as both .tenant() and .shared(). ` +
          'A tenant root cannot be shared — it defines the tenant boundary.',
      );
    }

    if (entry.table._shared) {
      shared.push(key);
      continue;
    }

    if (entry.table._tenant) {
      if (root !== null) {
        const existingRootName = registry[root]?.table._name;
        throw new Error(
          `Multiple tables marked as .tenant(): "${existingRootName}" and "${entry.table._name}". ` +
            'Only one tenant root is supported per application.',
        );
      }
      root = key;
    }
  }

  // If no tenant root, return early
  if (root === null) {
    return { root: null, directlyScoped: [], indirectlyScoped: [], shared };
  }

  const rootEntry = registry[root];
  if (!rootEntry) {
    return { root: null, directlyScoped: [], indirectlyScoped: [], shared };
  }
  const rootTableName = rootEntry.table._name;

  // Step 2: Find directly scoped models — any model with ref.one → root table
  const directlyScoped: string[] = [];

  for (const [key, entry] of entries) {
    if (key === root || shared.includes(key)) continue;

    const refsToRoot: string[] = [];
    for (const [relName, rel] of Object.entries(entry.relations)) {
      if (rel._type === 'one' && rel._target()._name === rootTableName) {
        refsToRoot.push(relName);
      }
    }

    if (refsToRoot.length === 1) {
      directlyScoped.push(key);
    } else if (refsToRoot.length > 1) {
      throw new Error(
        `Model "${key}" has ${refsToRoot.length} relations to tenant root ` +
          `"${root}" (${refsToRoot.join(', ')}). Mark the table as .shared() ` +
          "if it's cross-tenant and handle scoping manually in your access rules.",
      );
    }
  }

  // Step 3: Find indirectly scoped models via relation chains
  const scopedTableNames = new Set<string>();
  scopedTableNames.add(rootTableName);
  for (const key of directlyScoped) {
    const entry = registry[key];
    if (entry) scopedTableNames.add(entry.table._name);
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

      // Check if any ref.one relation targets a scoped or indirectly scoped table
      // (Only ref.one is used because tenant chain resolution follows FK → PK joins)
      for (const rel of Object.values(entry.relations)) {
        if (rel._type !== 'one') continue;
        const targetTableName = rel._target()._name;
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
