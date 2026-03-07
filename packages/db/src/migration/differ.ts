import type { ColumnSnapshot, IndexSnapshot, SchemaSnapshot } from './snapshot';

export type ChangeType =
  | 'table_added'
  | 'table_removed'
  | 'column_added'
  | 'column_removed'
  | 'column_altered'
  | 'column_renamed'
  | 'index_added'
  | 'index_removed'
  | 'enum_added'
  | 'enum_removed'
  | 'enum_altered';

export interface DiffChange {
  type: ChangeType;
  table?: string;
  column?: string;
  oldColumn?: string;
  newColumn?: string;
  oldType?: string;
  newType?: string;
  oldNullable?: boolean;
  newNullable?: boolean;
  oldDefault?: string;
  newDefault?: string;
  enumName?: string;
  addedValues?: string[];
  removedValues?: string[];
  columns?: string[];
  confidence?: number;
  indexType?: string;
  indexWhere?: string;
  indexUnique?: boolean;
}

export interface DiffResult {
  changes: DiffChange[];
}

/**
 * Compute a similarity score between two column snapshots.
 * Returns a value between 0 and 1 (1 = identical).
 */
function columnSimilarity(a: ColumnSnapshot, b: ColumnSnapshot): number {
  let score = 0;
  let total = 0;

  // Type match is heavily weighted
  total += 3;
  if (a.type === b.type) score += 3;

  // Nullable match
  total += 1;
  if (a.nullable === b.nullable) score += 1;

  // Primary match
  total += 1;
  if (a.primary === b.primary) score += 1;

  // Unique match
  total += 1;
  if (a.unique === b.unique) score += 1;

  return score / total;
}

/**
 * Serialize an index to a string for comparison.
 * Includes columns, type, where, and unique to detect property changes.
 */
function indexKey(idx: IndexSnapshot): string {
  const parts = [idx.columns.join(',')];
  if (idx.type) parts.push(`type:${idx.type}`);
  if (idx.where) parts.push(`where:${idx.where}`);
  if (idx.unique) parts.push('unique');
  return parts.join('|');
}

export function computeDiff(before: SchemaSnapshot, after: SchemaSnapshot): DiffResult {
  const changes: DiffChange[] = [];

  // Tables added
  for (const tableName of Object.keys(after.tables)) {
    if (!(tableName in before.tables)) {
      changes.push({ type: 'table_added', table: tableName });
    }
  }

  // Tables removed
  for (const tableName of Object.keys(before.tables)) {
    if (!(tableName in after.tables)) {
      changes.push({ type: 'table_removed', table: tableName });
    }
  }

  // Column-level changes for tables that exist in both
  for (const tableName of Object.keys(after.tables)) {
    if (!(tableName in before.tables)) continue;
    const beforeTable = before.tables[tableName];
    const afterTable = after.tables[tableName];
    if (!beforeTable || !afterTable) continue;

    const removedCols = Object.keys(beforeTable.columns).filter((c) => !(c in afterTable.columns));
    const addedCols = Object.keys(afterTable.columns).filter((c) => !(c in beforeTable.columns));

    // Rename detection: match removed columns to added columns by similarity
    const renames: Array<{ oldCol: string; newCol: string; confidence: number }> = [];
    const matchedRemoved = new Set<string>();
    const matchedAdded = new Set<string>();

    for (const removed of removedCols) {
      const removedSnap = beforeTable.columns[removed];
      if (!removedSnap) continue;

      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const added of addedCols) {
        if (matchedAdded.has(added)) continue;
        const addedSnap = afterTable.columns[added];
        if (!addedSnap) continue;

        const score = columnSimilarity(removedSnap, addedSnap);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = added;
        }
      }

      // Threshold: require at least 0.7 similarity for rename detection
      if (bestMatch && bestScore >= 0.7) {
        renames.push({ oldCol: removed, newCol: bestMatch, confidence: bestScore });
        matchedRemoved.add(removed);
        matchedAdded.add(bestMatch);
      }
    }

    // Emit renames
    for (const rename of renames) {
      changes.push({
        type: 'column_renamed',
        table: tableName,
        oldColumn: rename.oldCol,
        newColumn: rename.newCol,
        confidence: rename.confidence,
      });
    }

    // Emit remaining adds (not matched as renames)
    for (const colName of addedCols) {
      if (!matchedAdded.has(colName)) {
        changes.push({ type: 'column_added', table: tableName, column: colName });
      }
    }

    // Emit remaining removes (not matched as renames)
    for (const colName of removedCols) {
      if (!matchedRemoved.has(colName)) {
        changes.push({ type: 'column_removed', table: tableName, column: colName });
      }
    }

    // Columns altered
    for (const colName of Object.keys(afterTable.columns)) {
      if (!(colName in beforeTable.columns)) continue;
      const beforeCol = beforeTable.columns[colName];
      const afterCol = afterTable.columns[colName];
      if (!beforeCol || !afterCol) continue;

      if (
        beforeCol.type !== afterCol.type ||
        beforeCol.nullable !== afterCol.nullable ||
        beforeCol.default !== afterCol.default
      ) {
        const change: DiffChange = {
          type: 'column_altered',
          table: tableName,
          column: colName,
        };
        if (beforeCol.type !== afterCol.type) {
          change.oldType = beforeCol.type;
          change.newType = afterCol.type;
        }
        if (beforeCol.nullable !== afterCol.nullable) {
          change.oldNullable = beforeCol.nullable;
          change.newNullable = afterCol.nullable;
        }
        if (beforeCol.default !== afterCol.default) {
          change.oldDefault = beforeCol.default;
          change.newDefault = afterCol.default;
        }
        changes.push(change);
      }
    }

    // Index changes
    const beforeIndexKeys = new Set(beforeTable.indexes.map((i) => indexKey(i)));
    const afterIndexKeys = new Set(afterTable.indexes.map((i) => indexKey(i)));

    for (const idx of afterTable.indexes) {
      const key = indexKey(idx);
      if (!beforeIndexKeys.has(key)) {
        const change: DiffChange = {
          type: 'index_added',
          table: tableName,
          columns: [...idx.columns],
        };
        if (idx.type) change.indexType = idx.type;
        if (idx.where) change.indexWhere = idx.where;
        if (idx.unique) change.indexUnique = idx.unique;
        changes.push(change);
      }
    }

    for (const idx of beforeTable.indexes) {
      const key = indexKey(idx);
      if (!afterIndexKeys.has(key)) {
        const change: DiffChange = {
          type: 'index_removed',
          table: tableName,
          columns: [...idx.columns],
        };
        if (idx.type) change.indexType = idx.type;
        if (idx.where) change.indexWhere = idx.where;
        if (idx.unique) change.indexUnique = idx.unique;
        changes.push(change);
      }
    }
  }

  // Enum changes
  for (const enumName of Object.keys(after.enums)) {
    if (!(enumName in before.enums)) {
      changes.push({ type: 'enum_added', enumName });
    }
  }

  for (const enumName of Object.keys(before.enums)) {
    if (!(enumName in after.enums)) {
      changes.push({ type: 'enum_removed', enumName });
    }
  }

  for (const enumName of Object.keys(after.enums)) {
    if (!(enumName in before.enums)) continue;
    const beforeVals = before.enums[enumName];
    const afterVals = after.enums[enumName];
    if (!beforeVals || !afterVals) continue;

    const beforeSet = new Set(beforeVals);
    const afterSet = new Set(afterVals);

    const addedValues = afterVals.filter((v) => !beforeSet.has(v));
    const removedValues = beforeVals.filter((v) => !afterSet.has(v));

    if (addedValues.length > 0 || removedValues.length > 0) {
      changes.push({ type: 'enum_altered', enumName, addedValues, removedValues });
    }
  }

  return { changes };
}
