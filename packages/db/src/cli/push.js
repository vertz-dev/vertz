import { computeDiff, generateMigrationSql } from '../migration';
/**
 * Push schema changes directly to the database without creating a migration file.
 */
export async function push(options) {
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
    ...new Set(diff.changes.map((c) => c.table).filter((t) => t !== undefined)),
  ];
  return { sql, tablesAffected };
}
//# sourceMappingURL=push.js.map
