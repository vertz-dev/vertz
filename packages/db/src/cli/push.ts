import type { MigrationQueryFn, SchemaSnapshot } from '../migration';
import { computeDiff, generateMigrationSql } from '../migration';

export interface PushOptions {
  queryFn: MigrationQueryFn;
  currentSnapshot: SchemaSnapshot;
  previousSnapshot: SchemaSnapshot;
}

export interface PushResult {
  sql: string;
  tablesAffected: string[];
}

/**
 * Push schema changes directly to the database without creating a migration file.
 */
export async function push(options: PushOptions): Promise<PushResult> {
  const diff = computeDiff(options.previousSnapshot, options.currentSnapshot);

  const sql = generateMigrationSql(diff.changes, {
    tables: options.currentSnapshot.tables,
    enums: options.currentSnapshot.enums,
  });

  // Apply SQL directly
  if (sql.length > 0) {
    await options.queryFn(sql, []);
  }

  // Extract affected table names from changes
  const tablesAffected = [
    ...new Set(diff.changes.map((c) => c.table).filter((t): t is string => t !== undefined)),
  ];

  return { sql, tablesAffected };
}
