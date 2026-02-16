import { createMigrationRunner } from '../migration';
/**
 * Apply all pending migrations in order.
 *
 * In dry-run mode, returns the SQL that would be executed without modifying the database.
 */
export async function migrateDeploy(options) {
  const runner = createMigrationRunner();
  const isDryRun = options.dryRun ?? false;
  if (!isDryRun) {
    await runner.createHistoryTable(options.queryFn);
  }
  let applied;
  if (isDryRun) {
    try {
      applied = await runner.getApplied(options.queryFn);
    } catch {
      // History table may not exist yet; treat as no migrations applied.
      applied = [];
    }
  } else {
    applied = await runner.getApplied(options.queryFn);
  }
  const pending = runner.getPending(options.migrationFiles, applied);
  const appliedNames = [];
  const migrationResults = [];
  for (const migration of pending) {
    const result = await runner.apply(options.queryFn, migration.sql, migration.name, {
      dryRun: isDryRun,
    });
    appliedNames.push(migration.name);
    migrationResults.push(result);
  }
  return {
    applied: appliedNames,
    alreadyApplied: applied.map((a) => a.name),
    dryRun: isDryRun,
    migrations: migrationResults.length > 0 ? migrationResults : undefined,
  };
}
//# sourceMappingURL=migrate-deploy.js.map
