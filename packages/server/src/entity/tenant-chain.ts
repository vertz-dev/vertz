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
  readonly table: { readonly _name: string; readonly _columns: Record<string, unknown> };
  readonly relations: Record<string, RelationDef>;
  readonly _tenant?: string | null;
}

type ModelRegistry = Record<string, ModelRegistryEntry>;

// ---------------------------------------------------------------------------
// resolveTenantChain
// ---------------------------------------------------------------------------

/**
 * Resolves the relation chain from an indirectly scoped entity back to the
 * tenant root.
 *
 * Returns null if the entity is not indirectly scoped (i.e., it's the root,
 * directly scoped, shared, or unscoped).
 *
 * The chain is computed by walking `ref.one` relations from the entity until
 * we reach a directly-scoped model. The tenant column is read from the
 * directly-scoped model's `_tenant` relation FK.
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
  const directlyScopedTableNames = new Set<string>();
  for (const key of tenantGraph.directlyScoped) {
    const entry = registry[key];
    if (entry) directlyScopedTableNames.add(entry.table._name);
  }
  directlyScopedTableNames.add(rootTableName);

  // Walk the relation chain from entity to a directly-scoped model
  const hops: TenantChainHop[] = [];
  let currentKey = entityKey;
  const visited = new Set<string>();

  while (true) {
    if (visited.has(currentKey)) {
      // Cycle detected — shouldn't happen with valid schemas
      return null;
    }
    visited.add(currentKey);

    const currentEntry = registry[currentKey];
    if (!currentEntry) return null;

    // Find a ref.one relation that targets a scoped table (directly or indirectly scoped)
    let foundHop = false;
    for (const [, rel] of Object.entries(currentEntry.relations)) {
      if (rel._type !== 'one' || !rel._foreignKey) continue;

      const targetTableName = rel._target()._name;
      const targetKey = tableNameToKey.get(targetTableName);
      if (!targetKey) continue;

      // Check if this target is in the scoping path (directly scoped, root, or indirectly scoped)
      const targetIsDirectlyScoped = directlyScopedTableNames.has(targetTableName);
      const targetIsIndirectlyScoped = tenantGraph.indirectlyScoped.includes(targetKey);

      if (!targetIsDirectlyScoped && !targetIsIndirectlyScoped) continue;

      // Resolve the target table's PK column
      const targetEntry = registry[targetKey];
      if (!targetEntry) continue;
      const targetPk = resolvePrimaryKey(targetEntry.table._columns);

      hops.push({
        tableName: targetTableName,
        foreignKey: rel._foreignKey,
        targetColumn: targetPk,
      });

      // If we reached a directly scoped model, resolve the tenant column and return
      if (targetIsDirectlyScoped && targetKey !== tenantGraph.root) {
        const tenantColumn = resolveTenantFk(targetKey, registry);
        if (!tenantColumn) return null;
        return { hops, tenantColumn };
      }

      // If we reached the root, the tenant column is just the PK of root
      if (targetKey === tenantGraph.root) {
        return { hops, tenantColumn: rel._foreignKey };
      }

      // Continue walking from the target
      currentKey = targetKey;
      foundHop = true;
      break;
    }

    if (!foundHop) return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves the PK column name from a table's columns map. */
function resolvePrimaryKey(columns: Record<string, unknown>): string {
  for (const [key, col] of Object.entries(columns)) {
    if (col && typeof col === 'object' && '_meta' in col) {
      const meta = (col as { _meta: { primary?: boolean } })._meta;
      if (meta.primary) return key;
    }
  }
  return 'id';
}

/** Resolves the FK column used by a directly-scoped model's tenant relation. */
function resolveTenantFk(modelKey: string, registry: ModelRegistry): string | null {
  const entry = registry[modelKey];
  if (!entry || !entry._tenant) return null;

  const tenantRel = entry.relations[entry._tenant] as RelationDef | undefined;
  if (!tenantRel || !tenantRel._foreignKey) return null;

  return tenantRel._foreignKey;
}
