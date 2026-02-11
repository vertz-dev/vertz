import type { MigrationFile, MigrationQueryFn } from '../migration';
import { createMigrationRunner } from '../migration';

export interface MigrateDeployOptions {
  queryFn: MigrationQueryFn;
  migrationFiles: MigrationFile[];
}

export interface MigrateDeployResult {
  applied: string[];
  alreadyApplied: string[];
}

/**
 * Apply all pending migrations in order.
 */
export async function migrateDeploy(options: MigrateDeployOptions): Promise<MigrateDeployResult> {
  const runner = createMigrationRunner();

  await runner.createHistoryTable(options.queryFn);

  const applied = await runner.getApplied(options.queryFn);
  const pending = runner.getPending(options.migrationFiles, applied);

  const appliedNames: string[] = [];

  for (const migration of pending) {
    await runner.apply(options.queryFn, migration.sql, migration.name);
    appliedNames.push(migration.name);
  }

  return {
    applied: appliedNames,
    alreadyApplied: applied.map((a) => a.name),
  };
}
