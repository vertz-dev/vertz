import type { IndexType } from '../schema/table';
import type { TableSnapshot } from './snapshot';

const POSTGRES_ONLY_INDEX_TYPES: ReadonlySet<IndexType> = new Set([
  'hash',
  'gin',
  'gist',
  'brin',
  'hnsw',
  'ivfflat',
]);

/**
 * Validate index definitions against a target dialect.
 * Returns warning messages for unsupported features.
 */
export function validateIndexes(
  tables: Record<string, TableSnapshot>,
  dialect: 'postgres' | 'sqlite',
): string[] {
  const warnings: string[] = [];

  for (const [tableName, table] of Object.entries(tables)) {
    for (const idx of table.indexes) {
      if (idx.type && dialect === 'sqlite' && POSTGRES_ONLY_INDEX_TYPES.has(idx.type)) {
        warnings.push(
          `Index on "${tableName}" (${idx.columns.join(', ')}) uses type "${idx.type}" which is not supported on ${dialect}. The index type will be ignored.`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Validate column types against a target dialect.
 * Returns warning messages for unsupported column types.
 */
export function validateColumns(
  tables: Record<string, TableSnapshot>,
  dialect: 'postgres' | 'sqlite',
): string[] {
  const warnings: string[] = [];

  if (dialect !== 'sqlite') return warnings;

  for (const [tableName, table] of Object.entries(tables)) {
    for (const [colName, col] of Object.entries(table.columns)) {
      if (col.type === 'vector') {
        warnings.push(
          `Column "${colName}" on "${tableName}" uses type "vector" which is not supported on sqlite. It will be mapped to TEXT.`,
        );
      }
    }
  }

  return warnings;
}
