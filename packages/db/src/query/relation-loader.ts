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
import { buildSelect } from '../sql/select';

import type { QueryFn } from './executor';
import { executeQuery } from './executor';
import { resolveSelectColumns } from './helpers';
import { mapRow } from './row-mapper';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IncludeSpec {
  readonly [key: string]: true | { select?: Record<string, true>; include?: IncludeSpec };
}

interface RelationMeta {
  readonly def: RelationDef;
  readonly includeValue: true | { select?: Record<string, true>; include?: IncludeSpec };
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

// ---------------------------------------------------------------------------
// Core loader
// ---------------------------------------------------------------------------

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
 */
export async function loadRelations<T extends Record<string, unknown>>(
  queryFn: QueryFn,
  primaryRows: T[],
  relations: Record<string, RelationDef>,
  include: IncludeSpec,
  depth = 0,
  tablesRegistry?: Record<string, TableRegistryEntry>,
): Promise<T[]> {
  if (depth > 2 || primaryRows.length === 0) {
    return primaryRows;
  }

  // Collect relation metadata for each included relation
  const toLoad: RelationMeta[] = [];
  for (const [key, value] of Object.entries(include)) {
    if (value === undefined) continue;
    const rel = relations[key];
    if (!rel) continue;
    toLoad.push({ def: rel, includeValue: value });
  }

  if (toLoad.length === 0) {
    return primaryRows;
  }

  // Process each relation
  for (const { def, includeValue } of toLoad) {
    const relName = Object.entries(include).find(([, v]) => v === includeValue)?.[0];
    if (!relName) continue;

    const target = def._target();

    if (def._type === 'one') {
      await loadOneRelation(
        queryFn,
        primaryRows,
        def,
        target,
        relName,
        includeValue,
        depth,
        tablesRegistry,
      );
    } else if (def._through) {
      // Many-to-many via join table
      await loadManyToManyRelation(
        queryFn,
        primaryRows,
        def,
        target,
        relName,
        includeValue,
        depth,
        tablesRegistry,
      );
    } else {
      await loadManyRelation(
        queryFn,
        primaryRows,
        def,
        target,
        relName,
        includeValue,
        depth,
        tablesRegistry,
      );
    }
  }

  return primaryRows;
}

// ---------------------------------------------------------------------------
// Resolve target table's relations from the registry
// ---------------------------------------------------------------------------

/**
 * Find the registry entry for a given target table by matching `_name`.
 */
function findTargetRelations(
  target: TableDef<ColumnRecord>,
  tablesRegistry?: Record<string, TableRegistryEntry>,
): Record<string, RelationDef> | undefined {
  if (!tablesRegistry) return undefined;
  for (const entry of Object.values(tablesRegistry)) {
    if (entry.table._name === target._name) {
      return entry.relations;
    }
  }
  return undefined;
}

/**
 * Load a 'one' relation (belongsTo / many-to-one).
 *
 * The foreign key is on the primary table, pointing to the target table's PK.
 */
async function loadOneRelation<T extends Record<string, unknown>>(
  queryFn: QueryFn,
  primaryRows: T[],
  def: RelationDef,
  target: TableDef<ColumnRecord>,
  relName: string,
  includeValue: true | { select?: Record<string, true>; include?: IncludeSpec },
  depth: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
): Promise<void> {
  const fk = def._foreignKey;
  if (!fk) return;

  // Collect unique FK values from primary rows
  const fkValues = new Set<unknown>();
  for (const row of primaryRows) {
    const val = row[fk];
    if (val !== null && val !== undefined) {
      fkValues.add(val);
    }
  }

  if (fkValues.size === 0) {
    // No FK values — set null for all rows
    for (const row of primaryRows) {
      (row as Record<string, unknown>)[relName] = null;
    }
    return;
  }

  // Resolve select columns for the target table
  const selectOpt = typeof includeValue === 'object' ? includeValue.select : undefined;
  const columns = resolveSelectColumns(target, selectOpt);

  // Always include the target PK (id) for mapping back
  if (!columns.includes('id')) {
    columns.push('id');
  }

  // Build and execute the batch query
  const query = buildSelect({
    table: target._name,
    columns,
    where: { id: { in: [...fkValues] } },
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, query.sql, query.params);

  // Build a lookup map: target PK -> mapped row
  const lookup = new Map<unknown, Record<string, unknown>>();
  for (const row of res.rows) {
    const mapped = mapRow<Record<string, unknown>>(row as Record<string, unknown>);
    lookup.set(mapped.id, mapped);
  }

  // Handle nested includes on the related rows
  if (typeof includeValue === 'object' && includeValue.include && depth < 2) {
    const targetRelations = findTargetRelations(target, tablesRegistry);
    if (targetRelations) {
      const childRows = [...lookup.values()];
      await loadRelations(
        queryFn,
        childRows,
        targetRelations,
        includeValue.include,
        depth + 1,
        tablesRegistry,
      );
    }
  }

  // Attach related rows to primary rows
  for (const row of primaryRows) {
    const fkVal = row[fk];
    (row as Record<string, unknown>)[relName] = lookup.get(fkVal) ?? null;
  }
}

/**
 * Load a 'many' relation (hasMany / one-to-many).
 *
 * The foreign key is on the target table, pointing back to the primary table's PK.
 */
async function loadManyRelation<T extends Record<string, unknown>>(
  queryFn: QueryFn,
  primaryRows: T[],
  def: RelationDef,
  target: TableDef<ColumnRecord>,
  relName: string,
  includeValue: true | { select?: Record<string, true>; include?: IncludeSpec },
  depth: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
): Promise<void> {
  const fk = def._foreignKey;
  if (!fk) return;

  // Collect unique PK values from primary rows (the target FK points to these)
  const pkValues = new Set<unknown>();
  for (const row of primaryRows) {
    const val = row.id;
    if (val !== null && val !== undefined) {
      pkValues.add(val);
    }
  }

  if (pkValues.size === 0) {
    for (const row of primaryRows) {
      (row as Record<string, unknown>)[relName] = [];
    }
    return;
  }

  // Resolve select columns for the target table
  const selectOpt = typeof includeValue === 'object' ? includeValue.select : undefined;
  const columns = resolveSelectColumns(target, selectOpt);

  // Always include the FK column for mapping back
  if (!columns.includes(fk)) {
    columns.push(fk);
  }

  // Build and execute the batch query
  const query = buildSelect({
    table: target._name,
    columns,
    where: { [fk]: { in: [...pkValues] } },
  });

  const res = await executeQuery<Record<string, unknown>>(queryFn, query.sql, query.params);

  // Build a lookup map: primary PK -> related rows[]
  const lookup = new Map<unknown, Record<string, unknown>[]>();
  for (const row of res.rows) {
    const mapped = mapRow<Record<string, unknown>>(row as Record<string, unknown>);
    const parentId = mapped[fk];
    const existing = lookup.get(parentId);
    if (existing) {
      existing.push(mapped);
    } else {
      lookup.set(parentId, [mapped]);
    }
  }

  // Handle nested includes
  if (typeof includeValue === 'object' && includeValue.include && depth < 2) {
    const targetRelations = findTargetRelations(target, tablesRegistry);
    if (targetRelations) {
      const allChildRows = [...lookup.values()].flat();
      await loadRelations(
        queryFn,
        allChildRows,
        targetRelations,
        includeValue.include,
        depth + 1,
        tablesRegistry,
      );
    }
  }

  // Attach related rows to primary rows
  for (const row of primaryRows) {
    const pkVal = row.id;
    (row as Record<string, unknown>)[relName] = lookup.get(pkVal) ?? [];
  }
}

/**
 * Load a 'many' relation via a join table (many-to-many).
 *
 * Uses the _through metadata:
 * - _through.table() -> the join table definition
 * - _through.thisKey -> FK in join table pointing to the primary table
 * - _through.thatKey -> FK in join table pointing to the target table
 *
 * Algorithm:
 * 1. Query the join table for rows matching primary PKs via thisKey
 * 2. Collect target IDs from thatKey column of the join results
 * 3. Query the target table with those IDs
 * 4. Map results back to parent rows
 */
async function loadManyToManyRelation<T extends Record<string, unknown>>(
  queryFn: QueryFn,
  primaryRows: T[],
  def: RelationDef,
  target: TableDef<ColumnRecord>,
  relName: string,
  includeValue: true | { select?: Record<string, true>; include?: IncludeSpec },
  depth: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
): Promise<void> {
  const through = def._through;
  if (!through) return;

  const joinTable = through.table();
  const thisKey = through.thisKey; // FK in join table pointing to primary table
  const thatKey = through.thatKey; // FK in join table pointing to target table

  // Collect unique PK values from primary rows
  const pkValues = new Set<unknown>();
  for (const row of primaryRows) {
    const val = row.id;
    if (val !== null && val !== undefined) {
      pkValues.add(val);
    }
  }

  if (pkValues.size === 0) {
    for (const row of primaryRows) {
      (row as Record<string, unknown>)[relName] = [];
    }
    return;
  }

  // Step 1: Query the join table for matching rows
  const joinQuery = buildSelect({
    table: joinTable._name,
    columns: [thisKey, thatKey],
    where: { [thisKey]: { in: [...pkValues] } },
  });

  const joinRes = await executeQuery<Record<string, unknown>>(
    queryFn,
    joinQuery.sql,
    joinQuery.params,
  );

  // Step 2: Collect target IDs and build a mapping of primaryId -> targetId[]
  const primaryToTargetIds = new Map<unknown, unknown[]>();
  const allTargetIds = new Set<unknown>();

  for (const row of joinRes.rows) {
    const mapped = mapRow<Record<string, unknown>>(row as Record<string, unknown>);
    const primaryId = mapped[thisKey];
    const targetId = mapped[thatKey];

    if (targetId !== null && targetId !== undefined) {
      allTargetIds.add(targetId);

      const existing = primaryToTargetIds.get(primaryId);
      if (existing) {
        existing.push(targetId);
      } else {
        primaryToTargetIds.set(primaryId, [targetId]);
      }
    }
  }

  if (allTargetIds.size === 0) {
    for (const row of primaryRows) {
      (row as Record<string, unknown>)[relName] = [];
    }
    return;
  }

  // Step 3: Query the target table with those IDs
  const selectOpt = typeof includeValue === 'object' ? includeValue.select : undefined;
  const columns = resolveSelectColumns(target, selectOpt);

  // Always include the target PK (id) for mapping
  if (!columns.includes('id')) {
    columns.push('id');
  }

  const targetQuery = buildSelect({
    table: target._name,
    columns,
    where: { id: { in: [...allTargetIds] } },
  });

  const targetRes = await executeQuery<Record<string, unknown>>(
    queryFn,
    targetQuery.sql,
    targetQuery.params,
  );

  // Build a lookup map: target PK -> mapped row
  const targetLookup = new Map<unknown, Record<string, unknown>>();
  for (const row of targetRes.rows) {
    const mapped = mapRow<Record<string, unknown>>(row as Record<string, unknown>);
    targetLookup.set(mapped.id, mapped);
  }

  // Handle nested includes on the target rows
  if (typeof includeValue === 'object' && includeValue.include && depth < 2) {
    const targetRelations = findTargetRelations(target, tablesRegistry);
    if (targetRelations) {
      const allTargetRows = [...targetLookup.values()];
      await loadRelations(
        queryFn,
        allTargetRows,
        targetRelations,
        includeValue.include,
        depth + 1,
        tablesRegistry,
      );
    }
  }

  // Step 4: Map results back to parent rows
  for (const row of primaryRows) {
    const pkVal = row.id;
    const targetIds = primaryToTargetIds.get(pkVal) ?? [];
    const relatedRows: Record<string, unknown>[] = [];
    for (const targetId of targetIds) {
      const targetRow = targetLookup.get(targetId);
      if (targetRow) {
        relatedRows.push(targetRow);
      }
    }
    (row as Record<string, unknown>)[relName] = relatedRows;
  }
}
