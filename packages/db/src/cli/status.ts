import type { Result } from '@vertz/errors';
import type { MigrationError, MigrationFile, MigrationQueryFn } from '../migration';
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
export async function migrateStatus(
  options: MigrateStatusOptions,
): Promise<Result<MigrateStatusResult, MigrationError>> {
  const runner = createMigrationRunner();
  const createResult = await runner.createHistoryTable(options.queryFn);
  if (!createResult.ok) {
    return createResult;
  }

  const appliedResult = await runner.getApplied(options.queryFn);
  if (!appliedResult.ok) {
    return appliedResult;
  }

  const applied = appliedResult.data;
  const pending = runner.getPending(options.migrationFiles, applied);

  return {
    ok: true,
    data: {
      applied: applied.map((a) => ({
        name: a.name,
        checksum: a.checksum,
        appliedAt: a.appliedAt,
      })),
      pending: pending.map((p) => p.name),
    },
  };
}
