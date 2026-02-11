import type { AppliedMigration, MigrationFile, MigrationQueryFn } from '../migration';
import { createMigrationRunner } from '../migration';

export interface MigrateStatusOptions {
  queryFn: MigrationQueryFn;
  migrationFiles: MigrationFile[];
}

export interface MigrationInfo {
  name: string;
  checksum: string;
  appliedAt: Date;
}

export interface MigrateStatusResult {
  applied: MigrationInfo[];
  pending: string[];
}

/**
 * Report the status of migrations: which are applied and which are pending.
 */
export async function migrateStatus(options: MigrateStatusOptions): Promise<MigrateStatusResult> {
  const runner = createMigrationRunner();
  await runner.createHistoryTable(options.queryFn);
  const applied: AppliedMigration[] = await runner.getApplied(options.queryFn);
  const pending = runner.getPending(options.migrationFiles, applied);

  return {
    applied: applied.map((a) => ({
      name: a.name,
      checksum: a.checksum,
      appliedAt: a.appliedAt,
    })),
    pending: pending.map((p) => p.name),
  };
}
