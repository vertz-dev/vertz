import {
  computeDiff,
  createMigrationRunner,
  formatMigrationFilename,
  generateMigrationSql,
  nextMigrationNumber,
} from '../migration';
/**
 * Generate a migration from schema diff, optionally apply it.
 *
 * In dry-run mode, generates SQL and returns it WITHOUT applying or writing files.
 */
export async function migrateDev(options) {
  const diff = computeDiff(options.previousSnapshot, options.currentSnapshot);
  const sql = generateMigrationSql(diff.changes, {
    tables: options.currentSnapshot.tables,
    enums: options.currentSnapshot.enums,
  });
  // Extract rename suggestions
  const renames = diff.changes
    .filter((c) => c.type === 'column_renamed')
    .map((c) => ({
      table: c.table,
      oldColumn: c.oldColumn,
      newColumn: c.newColumn,
      confidence: c.confidence,
    }));
  const num = nextMigrationNumber(options.existingFiles);
  const filename = formatMigrationFilename(num, options.migrationName);
  const filePath = `${options.migrationsDir}/${filename}`;
  if (options.dryRun) {
    return {
      migrationFile: filename,
      sql,
      dryRun: true,
      renames: renames.length > 0 ? renames : undefined,
      snapshot: options.currentSnapshot,
    };
  }
  // Write migration file
  await options.writeFile(filePath, sql);
  // Apply migration
  const runner = createMigrationRunner();
  await runner.createHistoryTable(options.queryFn);
  await runner.apply(options.queryFn, sql, filename, { dryRun: false });
  return {
    migrationFile: filename,
    sql,
    appliedAt: new Date(),
    dryRun: false,
    renames: renames.length > 0 ? renames : undefined,
    snapshot: options.currentSnapshot,
  };
}
//# sourceMappingURL=migrate-dev.js.map
