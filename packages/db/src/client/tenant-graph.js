// ---------------------------------------------------------------------------
// computeTenantGraph
// ---------------------------------------------------------------------------
/**
 * Analyzes a table registry to compute the tenant scoping graph.
 *
 * 1. Finds the tenant root — the table that tenant columns point to.
 * 2. Classifies tables as directly scoped (has d.tenant()), indirectly scoped
 *    (references a scoped table via .references()), or shared (.shared()).
 * 3. Tables that are none of the above are unscoped — the caller should
 *    log a notice for those.
 */
export function computeTenantGraph(registry) {
  const entries = Object.entries(registry);
  // Build a map of table name -> registry key for lookup
  const tableNameToKey = new Map();
  for (const [key, entry] of entries) {
    tableNameToKey.set(entry.table._name, key);
  }
  // Step 1: Find tenant root and directly scoped tables
  let root = null;
  const directlyScoped = [];
  const shared = [];
  for (const [key, entry] of entries) {
    // Check for shared
    if (entry.table._shared) {
      shared.push(key);
      continue;
    }
    // Check columns for tenant marker
    const columns = entry.table._columns;
    for (const colKey of Object.keys(columns)) {
      const col = columns[colKey];
      if (col._meta.isTenant && col._meta.references) {
        // This table is directly scoped
        if (!directlyScoped.includes(key)) {
          directlyScoped.push(key);
        }
        // The referenced table is the tenant root
        const rootTableName = col._meta.references.table;
        const rootKey = tableNameToKey.get(rootTableName);
        if (rootKey && root === null) {
          root = rootKey;
        }
      }
    }
  }
  // Step 2: Find indirectly scoped tables via .references() chains
  // Build a set of table names that are scoped (root + directly scoped)
  const scopedTableNames = new Set();
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
  const indirectlyScoped = [];
  const indirectlyScopedNames = new Set();
  // Iteratively resolve indirect scoping until no new tables are found
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
      // Check if any column references a scoped or indirectly scoped table
      const columns = entry.table._columns;
      for (const colKey of Object.keys(columns)) {
        const col = columns[colKey];
        if (col._meta.references && !col._meta.isTenant) {
          const refTable = col._meta.references.table;
          if (scopedTableNames.has(refTable) || indirectlyScopedNames.has(refTable)) {
            indirectlyScoped.push(key);
            indirectlyScopedNames.add(entry.table._name);
            scopedTableNames.add(entry.table._name);
            changed = true;
            break;
          }
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
//# sourceMappingURL=tenant-graph.js.map
