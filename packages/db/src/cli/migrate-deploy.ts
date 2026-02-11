import type { ApplyResult, MigrationFile, MigrationQueryFn } from '../migration';
import { createMigrationRunner } from '../migration';

export interface MigrateDeployOptions {
  queryFn: MigrationQueryFn;
  migrationFiles: MigrationFile[];
  /** When true, return the SQL that would be executed without applying. */
  dryRun?: boolean;
}

export interface MigrateDeployResult {
  applied: string[];
  alreadyApplied: string[];
  /** When dry-run is enabled, contains the details of each migration that would be applied. */
  dryRun: boolean;
  /** Detailed results for each migration that was (or would be) applied. */
  migrations?: ApplyResult[];
}

/**
 * Apply all pending migrations in order.
 *
 * In dry-run mode, returns the SQL that would be executed without modifying the database.
 */
export async function migrateDeploy(options: MigrateDeployOptions): Promise<MigrateDeployResult> {
  const runner = createMigrationRunner();
  const isDryRun = options.dryRun ?? false;

  await runner.createHistoryTable(options.queryFn);

  const applied = await runner.getApplied(options.queryFn);
  const pending = runner.getPending(options.migrationFiles, applied);

  const appliedNames: string[] = [];
  const migrationResults: ApplyResult[] = [];

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
