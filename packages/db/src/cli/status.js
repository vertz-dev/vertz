import { createMigrationRunner } from '../migration';
/**
 * Report the status of migrations: which are applied and which are pending.
 */
export async function migrateStatus(options) {
  const runner = createMigrationRunner();
  await runner.createHistoryTable(options.queryFn);
  const applied = await runner.getApplied(options.queryFn);
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
//# sourceMappingURL=status.js.map
