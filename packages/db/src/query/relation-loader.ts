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
 * - `include: { relation: { where: { ... } } }` — filter related rows
 * - `include: { relation: { orderBy: { ... } } }` — sort related rows
 * - `include: { relation: { limit: N } }` — per-parent limit (post-fetch grouping)
 * - Nested includes up to depth 3
 * - 'one' relations (return single object, where acts as conditional load)
 * - 'many' relations (return array)
 * - 'many' through join table (many-to-many, where/orderBy on target table)
 * - Query budget counter (max 50 queries per loadRelations call tree)
 */

import type { RelationDef } from '../schema/relation';
import type { ColumnRecord, TableDef } from '../schema/table';
import { buildSelect } from '../sql/select';

import type { QueryFn } from './executor';
import { executeQuery } from './executor';
import { getPrimaryKeyColumns, resolveSelectColumns } from './helpers';
import { mapRow } from './row-mapper';

/**
 * Resolve the primary key column name from a table definition.
 * Falls back to 'id' if no PK metadata is found (backward compat).
 */
function resolvePkColumn(table: TableDef<ColumnRecord>): string {
  const pkCols = getPrimaryKeyColumns(table);
  const first = pkCols[0];
  return first !== undefined ? first : 'id';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IncludeSpec {
  readonly [key: string]:
    | true
    | {
        select?: Record<string, true>;
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        limit?: number;
        include?: IncludeSpec;
      };
}

/** The value type for a single include entry. */
type IncludeValue = Exclude<IncludeSpec[string], undefined>;

interface RelationMeta {
  readonly key: string;
  readonly def: RelationDef;
  readonly includeValue: IncludeValue;
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
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of SQL queries a single loadRelations call tree may execute. */
export const MAX_RELATION_QUERY_BUDGET = 50;

/** Default per-parent limit when no explicit maxLimit is configured. */
export const DEFAULT_RELATION_LIMIT = 100;

/** Hard cap on total rows returned by any single relation batch query. */
export const GLOBAL_RELATION_ROW_LIMIT = 10_000;

/** Mutable counter for tracking query budget across recursive calls. */
interface QueryBudget {
  remaining: number;
}

/**
 * Safely merge a user-provided where clause with a batch IN clause.
 * The batch clause (FK/PK IN (...)) ALWAYS takes precedence — user cannot
 * override the batch key, which would break parent scoping and enable data leaks.
 */
function safeMergeWhere(
  batchWhere: Record<string, unknown>,
  userWhere: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!userWhere) return batchWhere;
  const merged = { ...batchWhere };
  for (const [key, value] of Object.entries(userWhere)) {
    if (!(key in batchWhere)) {
      merged[key] = value;
    }
    // Silently drop keys that collide with batch clause — they are FK/PK columns
  }
  return merged;
}

/**
 * Resolve the effective per-parent limit for a relation include.
 * Applies DEFAULT_RELATION_LIMIT when no explicit limit or maxLimit is set.
 */
function resolveEffectiveLimit(includeValue: IncludeValue): number {
  const userLimit = typeof includeValue === 'object' ? includeValue.limit : undefined;
  if (typeof userLimit === 'number' && userLimit > 0) {
    return userLimit;
  }
  return DEFAULT_RELATION_LIMIT;
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
 * @param depth - Current recursion depth (max 3)
 * @param tablesRegistry - The full table registry for resolving nested/m2m relations
 * @param primaryTable - The primary table definition (for PK resolution)
 * @param queryBudget - Mutable counter for tracking query budget
 */
export async function loadRelations<T extends Record<string, unknown>>(
  queryFn: QueryFn,
  primaryRows: T[],
  relations: Record<string, RelationDef>,
  include: IncludeSpec,
  depth = 0,
  tablesRegistry?: Record<string, TableRegistryEntry>,
  primaryTable?: TableDef<ColumnRecord>,
  queryBudget?: QueryBudget,
): Promise<T[]> {
  if (depth > 3 || primaryRows.length === 0) {
    return primaryRows;
  }

  // Initialize query budget at the root call
  const budget = queryBudget ?? { remaining: MAX_RELATION_QUERY_BUDGET };

  // Collect relation metadata for each included relation
  const toLoad: RelationMeta[] = [];
  for (const [key, value] of Object.entries(include)) {
    if (value === undefined) continue;
    const rel = relations[key];
    if (!rel) continue;
    toLoad.push({ key, def: rel, includeValue: value });
  }

  if (toLoad.length === 0) {
    return primaryRows;
  }

  // Process each relation
  for (const { key: relName, def, includeValue } of toLoad) {
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
        budget,
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
        primaryTable,
        budget,
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
        primaryTable,
        budget,
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
  includeValue: IncludeValue,
  depth: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
  queryBudget?: QueryBudget,
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

  // Resolve the target table's PK column
  const targetPk = resolvePkColumn(target);

  // Resolve select columns for the target table
  const selectOpt = typeof includeValue === 'object' ? includeValue.select : undefined;
  const columns = resolveSelectColumns(target, selectOpt);

  // Always include the target PK for mapping back
  if (!columns.includes(targetPk)) {
    columns.push(targetPk);
  }

  // Check query budget
  if (queryBudget && queryBudget.remaining <= 0) {
    throw new Error(
      `Relation query budget exceeded (max ${MAX_RELATION_QUERY_BUDGET} queries). ` +
        'Reduce include depth or number of included relations.',
    );
  }

  // Merge user where with the batch IN clause for conditional load
  // Batch clause takes precedence — user cannot override the PK IN clause
  const userWhere = typeof includeValue === 'object' ? includeValue.where : undefined;
  const batchWhere = safeMergeWhere({ [targetPk]: { in: [...fkValues] } }, userWhere);

  // Build and execute the batch query
  const query = buildSelect({
    table: target._name,
    columns,
    where: batchWhere,
  });

  if (queryBudget) queryBudget.remaining--;
  const res = await executeQuery<Record<string, unknown>>(queryFn, query.sql, query.params);

  // Build a lookup map: target PK -> mapped row
  const lookup = new Map<unknown, Record<string, unknown>>();
  for (const row of res.rows) {
    const mapped = mapRow<Record<string, unknown>>(row as Record<string, unknown>);
    lookup.set(mapped[targetPk], mapped);
  }

  // Handle nested includes on the related rows
  if (typeof includeValue === 'object' && includeValue.include && depth < 3) {
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
        target,
        queryBudget,
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
  includeValue: IncludeValue,
  depth: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
  primaryTable?: TableDef<ColumnRecord>,
  queryBudget?: QueryBudget,
): Promise<void> {
  const fk = def._foreignKey;
  if (!fk) return;

  // Resolve the primary table's PK column
  const primaryPk = primaryTable ? resolvePkColumn(primaryTable) : 'id';

  // Collect unique PK values from primary rows (the target FK points to these)
  const pkValues = new Set<unknown>();
  for (const row of primaryRows) {
    const val = row[primaryPk];
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

  // Merge user where with the batch IN clause
  // Batch clause takes precedence — user cannot override the FK IN clause
  const userWhere = typeof includeValue === 'object' ? includeValue.where : undefined;
  const batchWhere = safeMergeWhere({ [fk]: { in: [...pkValues] } }, userWhere);

  // Resolve orderBy from the include option
  const userOrderBy = typeof includeValue === 'object' ? includeValue.orderBy : undefined;

  // Check query budget
  if (queryBudget && queryBudget.remaining <= 0) {
    throw new Error(
      `Relation query budget exceeded (max ${MAX_RELATION_QUERY_BUDGET} queries). ` +
        'Reduce include depth or number of included relations.',
    );
  }

  // Build and execute the batch query with global row cap
  const query = buildSelect({
    table: target._name,
    columns,
    where: batchWhere,
    orderBy: userOrderBy,
    limit: GLOBAL_RELATION_ROW_LIMIT,
  });

  if (queryBudget) queryBudget.remaining--;
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

  // Apply per-parent limit (post-fetch grouping)
  // Always applies — uses DEFAULT_RELATION_LIMIT when no explicit limit is set
  const effectiveLimit = resolveEffectiveLimit(includeValue);
  for (const [parentId, rows] of lookup) {
    if (rows.length > effectiveLimit) {
      lookup.set(parentId, rows.slice(0, effectiveLimit));
    }
  }

  // Handle nested includes
  if (typeof includeValue === 'object' && includeValue.include && depth < 3) {
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
        target,
        queryBudget,
      );
    }
  }

  // Attach related rows to primary rows
  for (const row of primaryRows) {
    const pkVal = row[primaryPk];
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
  includeValue: IncludeValue,
  depth: number,
  tablesRegistry?: Record<string, TableRegistryEntry>,
  primaryTable?: TableDef<ColumnRecord>,
  queryBudget?: QueryBudget,
): Promise<void> {
  const through = def._through;
  if (!through) return;

  // Resolve the primary and target PKs
  const primaryPk = primaryTable ? resolvePkColumn(primaryTable) : 'id';
  const targetPk = resolvePkColumn(target);

  const joinTable = through.table();
  const thisKey = through.thisKey; // FK in join table pointing to primary table
  const thatKey = through.thatKey; // FK in join table pointing to target table

  // Collect unique PK values from primary rows
  const pkValues = new Set<unknown>();
  for (const row of primaryRows) {
    const val = row[primaryPk];
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

  // Check query budget (M2M uses 2 queries)
  if (queryBudget && queryBudget.remaining <= 0) {
    throw new Error(
      `Relation query budget exceeded (max ${MAX_RELATION_QUERY_BUDGET} queries). ` +
        'Reduce include depth or number of included relations.',
    );
  }

  // Step 1: Query the join table for matching rows
  const joinQuery = buildSelect({
    table: joinTable._name,
    columns: [thisKey, thatKey],
    where: { [thisKey]: { in: [...pkValues] } },
  });

  if (queryBudget) queryBudget.remaining--;
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

  // Always include the target PK for mapping
  if (!columns.includes(targetPk)) {
    columns.push(targetPk);
  }

  // Merge user where with the target ID IN clause
  // Batch clause takes precedence — user cannot override the PK IN clause
  const userWhere = typeof includeValue === 'object' ? includeValue.where : undefined;
  const targetWhere = safeMergeWhere({ [targetPk]: { in: [...allTargetIds] } }, userWhere);

  // Resolve orderBy from the include option
  const userOrderBy = typeof includeValue === 'object' ? includeValue.orderBy : undefined;

  // Check query budget for the second query
  if (queryBudget && queryBudget.remaining <= 0) {
    throw new Error(
      `Relation query budget exceeded (max ${MAX_RELATION_QUERY_BUDGET} queries). ` +
        'Reduce include depth or number of included relations.',
    );
  }

  const targetQuery = buildSelect({
    table: target._name,
    columns,
    where: targetWhere,
    orderBy: userOrderBy,
    limit: GLOBAL_RELATION_ROW_LIMIT,
  });

  if (queryBudget) queryBudget.remaining--;
  const targetRes = await executeQuery<Record<string, unknown>>(
    queryFn,
    targetQuery.sql,
    targetQuery.params,
  );

  // Build a lookup map: target PK -> mapped row
  const targetLookup = new Map<unknown, Record<string, unknown>>();
  for (const row of targetRes.rows) {
    const mapped = mapRow<Record<string, unknown>>(row as Record<string, unknown>);
    targetLookup.set(mapped[targetPk], mapped);
  }

  // Handle nested includes on the target rows
  if (typeof includeValue === 'object' && includeValue.include && depth < 3) {
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
        target,
        queryBudget,
      );
    }
  }

  // Step 4: Map results back to parent rows
  for (const row of primaryRows) {
    const pkVal = row[primaryPk];
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
