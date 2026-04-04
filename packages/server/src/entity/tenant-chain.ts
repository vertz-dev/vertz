import type { RelationDef, TenantGraph } from '@vertz/db';

// ---------------------------------------------------------------------------
// TenantChain types
// ---------------------------------------------------------------------------

/** One hop in the relation chain from entity to tenant root. */
export interface TenantChainHop {
  /** Target table name (e.g., 'projects') */
  readonly tableName: string;
  /** FK column on the current table (e.g., 'projectId') */
  readonly foreignKey: string;
  /** PK column on the target table (e.g., 'id') */
  readonly targetColumn: string;
}

/** Full chain from an indirectly scoped entity to the tenant root. */
export interface TenantChain {
  /** Ordered hops from entity → ... → directly-scoped table */
  readonly hops: readonly TenantChainHop[];
  /** The tenant FK column on the final hop's target table (e.g., 'organizationId') */
  readonly tenantColumn: string;
}

// ---------------------------------------------------------------------------
// Model registry types (subset of what createDb receives)
// ---------------------------------------------------------------------------

interface ModelRegistryEntry {
  readonly table: {
    readonly _name: string;
    readonly _columns: Record<string, unknown>;
    readonly _tenant?: boolean;
  };
  readonly relations: Record<string, RelationDef>;
}

type ModelRegistry = Record<string, ModelRegistryEntry>;

// ---------------------------------------------------------------------------
// resolveTenantFkFromRelations
// ---------------------------------------------------------------------------

/**
 * Finds the tenant FK column by scanning a model's ref.one relations for one
 * targeting the tenant root table. Returns the FK column name, or null.
 */
export function resolveTenantFkFromRelations(
  entry: ModelRegistryEntry,
  rootTableName: string,
): string | null {
  for (const rel of Object.values(entry.relations)) {
    if (rel._type === 'one' && rel._foreignKey && rel._target()._name === rootTableName) {
      return rel._foreignKey;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// resolveTenantChain — BFS shortest-path
// ---------------------------------------------------------------------------

/**
 * Resolves the relation chain from an indirectly scoped entity back to the
 * tenant root using BFS (breadth-first search) to guarantee the shortest path.
 *
 * Returns null if the entity is not indirectly scoped (i.e., it's the root,
 * directly scoped, shared, or unscoped).
 *
 * Shared tables are excluded from traversal — a ref.one to a .shared() table
 * is never followed.
 */
export function resolveTenantChain(
  entityKey: string,
  tenantGraph: TenantGraph,
  registry: ModelRegistry,
): TenantChain | null {
  // Only resolve for indirectly scoped entities
  if (!tenantGraph.indirectlyScoped.includes(entityKey)) {
    return null;
  }

  if (tenantGraph.root === null) {
    return null;
  }

  const rootEntry = registry[tenantGraph.root];
  if (!rootEntry) return null;

  const rootTableName = rootEntry.table._name;

  // Build a map of table name -> model key for reverse lookup
  const tableNameToKey = new Map<string, string>();
  for (const [key, entry] of Object.entries(registry)) {
    tableNameToKey.set(entry.table._name, key);
  }

  // Set of table names that are directly scoped or root
  const directlyScopedKeys = new Set(tenantGraph.directlyScoped);
  directlyScopedKeys.add(tenantGraph.root);

  // Multi-level: add all tenant level keys so BFS can traverse through
  // intermediate tenant levels (e.g., projects → accounts in a 2-level chain).
  const levels = tenantGraph.levels ?? [];
  for (const level of levels) {
    directlyScopedKeys.add(level.key);
  }

  // Set of shared model keys — excluded from traversal
  const sharedKeys = new Set(tenantGraph.shared);

  // Set of indirectly scoped model keys
  const indirectlyScopedKeys = new Set(tenantGraph.indirectlyScoped);

  const entityEntry = registry[entityKey];
  if (!entityEntry) return null;

  // BFS queue: each entry tracks the full path taken to reach it
  const queue: Array<{ key: string; hops: TenantChainHop[] }> = [];
  const visited = new Set<string>();
  visited.add(entityKey);

  // Seed: all ref.one relations from the entity
  for (const rel of Object.values(entityEntry.relations)) {
    if (rel._type !== 'one' || !rel._foreignKey) continue;

    const targetTableName = rel._target()._name;
    const targetKey = tableNameToKey.get(targetTableName);
    if (!targetKey || visited.has(targetKey)) continue;

    // Skip shared tables
    if (sharedKeys.has(targetKey)) continue;

    // Skip unscoped targets
    if (!directlyScopedKeys.has(targetKey) && !indirectlyScopedKeys.has(targetKey)) continue;

    const targetEntry = registry[targetKey];
    if (!targetEntry) continue;
    const targetPk = resolvePrimaryKey(targetEntry.table._columns, targetTableName);

    const hop: TenantChainHop = {
      tableName: targetTableName,
      foreignKey: rel._foreignKey,
      targetColumn: targetPk,
    };

    // If target is directly scoped (not root), resolve its tenant FK
    if (directlyScopedKeys.has(targetKey) && targetKey !== tenantGraph.root) {
      const tenantColumn = resolveTenantFkFromRelations(targetEntry, rootTableName);
      if (tenantColumn) {
        return { hops: [hop], tenantColumn };
      }
    }

    // If target is the root, the FK is the tenant column
    if (targetKey === tenantGraph.root) {
      return { hops: [hop], tenantColumn: rel._foreignKey };
    }

    // Otherwise, enqueue for further BFS exploration
    queue.push({ key: targetKey, hops: [hop] });
  }

  // BFS: expand level by level — guarantees shortest path
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { key: currentKey, hops } = item;
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    const entry = registry[currentKey];
    if (!entry) continue;

    for (const rel of Object.values(entry.relations)) {
      if (rel._type !== 'one' || !rel._foreignKey) continue;

      const targetTableName = rel._target()._name;
      const targetKey = tableNameToKey.get(targetTableName);
      if (!targetKey || visited.has(targetKey)) continue;
      if (sharedKeys.has(targetKey)) continue;
      if (!directlyScopedKeys.has(targetKey) && !indirectlyScopedKeys.has(targetKey)) continue;

      const targetEntry = registry[targetKey];
      if (!targetEntry) continue;
      const targetPk = resolvePrimaryKey(targetEntry.table._columns, targetTableName);

      const hop: TenantChainHop = {
        tableName: targetTableName,
        foreignKey: rel._foreignKey,
        targetColumn: targetPk,
      };
      const newHops = [...hops, hop];

      if (directlyScopedKeys.has(targetKey) && targetKey !== tenantGraph.root) {
        const tenantColumn = resolveTenantFkFromRelations(targetEntry, rootTableName);
        if (tenantColumn) {
          return { hops: newHops, tenantColumn };
        }
      }

      if (targetKey === tenantGraph.root) {
        return { hops: newHops, tenantColumn: rel._foreignKey };
      }

      queue.push({ key: targetKey, hops: newHops });
    }
  }

  return null; // No path found
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves the PK column name from a table's columns map. Throws for composite PKs. */
function resolvePrimaryKey(columns: Record<string, unknown>, tableName: string): string {
  const pkCols: string[] = [];
  for (const [key, col] of Object.entries(columns)) {
    if (col && typeof col === 'object' && '_meta' in col) {
      const meta = (col as { _meta: { primary?: boolean } })._meta;
      if (meta.primary) pkCols.push(key);
    }
  }
  if (pkCols.length > 1) {
    throw new Error(
      `Tenant chain resolution encountered composite primary key on table "${tableName}" ` +
        `[${pkCols.join(', ')}]. A composite-PK table cannot be an intermediate hop in the ` +
        `tenant chain because ref.one() creates single-column foreign keys, which cannot ` +
        `reference a composite primary key. The composite-PK table itself CAN be the chain ` +
        `origin (entity). To fix: use a surrogate single-column PK on "${tableName}", or ` +
        `restructure the relation chain to avoid traversing through this table.`,
    );
  }
  return pkCols[0] ?? 'id';
}
