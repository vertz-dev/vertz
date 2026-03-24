import type { RelationDef } from '../schema/relation';
import type { ColumnRecord, TableDef } from '../schema/table';

// ---------------------------------------------------------------------------
// TenantGraph — result of tenant analysis
// ---------------------------------------------------------------------------

/** One level in a multi-level tenant hierarchy. */
export interface TenantLevel {
  /** Model key (e.g., 'account', 'project') */
  readonly key: string;
  /** Table name */
  readonly tableName: string;
  /** FK column to parent level (null for root) */
  readonly parentFk: string | null;
  /** Parent level key (null for root) */
  readonly parentKey: string | null;
  /** Depth in the hierarchy (0 = root) */
  readonly depth: number;
}

export interface TenantGraph {
  /** The tenant root table key (e.g., "organizations"). Null if no tenant declarations exist. */
  readonly root: string | null;
  /** Ordered chain of tenant levels (root first, leaf last). Single-entry for single-level. */
  readonly levels: readonly TenantLevel[];
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

  // Step 1: Find all tenant tables and shared tables
  const tenantKeys: string[] = [];
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
      tenantKeys.push(key);
    }
  }

  // If no tenant tables, return early
  if (tenantKeys.length === 0) {
    return { root: null, levels: [], directlyScoped: [], indirectlyScoped: [], shared };
  }

  // Step 1b: Resolve tenant hierarchy — build chain from FK relationships
  const levels = resolveTenantLevels(tenantKeys, registry, tableNameToKey);
  const root = levels[0]!.key;

  const rootEntry = registry[root];
  if (!rootEntry) {
    return { root: null, levels: [], directlyScoped: [], indirectlyScoped: [], shared };
  }
  const rootTableName = rootEntry.table._name;

  // Step 2: Find directly scoped models — any model with ref.one → root table
  const directlyScoped: string[] = [];
  const tenantKeySet = new Set(tenantKeys);

  for (const [key, entry] of entries) {
    if (key === root || shared.includes(key) || tenantKeySet.has(key)) continue;

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
  // All tenant-level tables are scoped
  for (const key of tenantKeys) {
    const e = registry[key];
    if (e) scopedTableNames.add(e.table._name);
  }
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
      // Skip tenant keys, directly scoped, shared, and already indirectly scoped
      if (
        tenantKeySet.has(key) ||
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
    levels,
    directlyScoped,
    indirectlyScoped,
    shared,
  };
}

// ---------------------------------------------------------------------------
// resolveTenantLevels — build ordered chain from FK relationships
// ---------------------------------------------------------------------------

const MAX_TENANT_LEVELS = 4;

function resolveTenantLevels(
  tenantKeys: string[],
  registry: ModelRegistry,
  tableNameToKey: Map<string, string>,
): TenantLevel[] {
  if (tenantKeys.length === 1) {
    const key = tenantKeys[0]!;
    const entry = registry[key]!;
    return [{ key, tableName: entry.table._name, parentFk: null, parentKey: null, depth: 0 }];
  }

  // Build a set of tenant table names for quick lookup
  const tenantTableNames = new Set<string>();
  for (const key of tenantKeys) {
    tenantTableNames.add(registry[key]!.table._name);
  }

  // For each tenant key, find its parent (another tenant key it has a ref.one to)
  const parentMap = new Map<string, { parentKey: string; fk: string }>();
  for (const key of tenantKeys) {
    const entry = registry[key]!;
    for (const rel of Object.values(entry.relations)) {
      if (rel._type !== 'one' || !rel._foreignKey) continue;
      const targetTableName = rel._target()._name;
      if (tenantTableNames.has(targetTableName)) {
        const targetKey = tableNameToKey.get(targetTableName);
        if (targetKey && tenantKeys.includes(targetKey)) {
          parentMap.set(key, { parentKey: targetKey, fk: rel._foreignKey });
          break;
        }
      }
    }
  }

  // Find the root — the tenant key that is not a child of any other tenant key
  const childKeys = new Set(parentMap.keys());
  const roots = tenantKeys.filter((k) => !childKeys.has(k));

  if (roots.length !== 1) {
    const names = tenantKeys.map((k) => `"${registry[k]!.table._name}"`).join(', ');
    throw new Error(
      `Multiple .tenant() tables (${names}) do not form a single FK chain. ` +
        'Ensure each child .tenant() table has a ref.one relation to its parent .tenant() table.',
    );
  }

  // Build the chain from root to leaf
  const levels: TenantLevel[] = [];
  const rootKey = roots[0]!;
  const rootEntry = registry[rootKey]!;
  levels.push({
    key: rootKey,
    tableName: rootEntry.table._name,
    parentFk: null,
    parentKey: null,
    depth: 0,
  });

  // Build child lookup: parentKey → childKey
  const childLookup = new Map<string, string>();
  for (const [childKey, { parentKey }] of parentMap) {
    if (childLookup.has(parentKey)) {
      // Fork detected — two children point to the same parent
      const names = tenantKeys.map((k) => `"${registry[k]!.table._name}"`).join(', ');
      throw new Error(
        `Multiple .tenant() tables (${names}) do not form a single FK chain. ` +
          'Ensure each child .tenant() table has a ref.one relation to its parent .tenant() table.',
      );
    }
    childLookup.set(parentKey, childKey);
  }

  // Walk from root to leaf
  let current: string = rootKey;
  while (childLookup.has(current)) {
    const childKey = childLookup.get(current)!;
    const { fk } = parentMap.get(childKey)!;
    const childEntry = registry[childKey]!;
    levels.push({
      key: childKey,
      tableName: childEntry.table._name,
      parentFk: fk,
      parentKey: current,
      depth: levels.length,
    });
    current = childKey;
  }

  // Validate: all tenant keys should be in the chain
  if (levels.length !== tenantKeys.length) {
    const names = tenantKeys.map((k) => `"${registry[k]!.table._name}"`).join(', ');
    throw new Error(
      `Multiple .tenant() tables (${names}) do not form a single FK chain. ` +
        'Ensure each child .tenant() table has a ref.one relation to its parent .tenant() table.',
    );
  }

  // Validate depth cap
  if (levels.length > MAX_TENANT_LEVELS) {
    throw new Error(
      `Tenant hierarchy exceeds maximum of ${MAX_TENANT_LEVELS} levels. ` +
        `Found ${levels.length} levels: ${levels.map((l) => `"${l.tableName}"`).join(' → ')}.`,
    );
  }

  return levels;
}
