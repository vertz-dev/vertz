import type { ApplyResult, MigrationFile, MigrationQueryFn } from '../migration';
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
export declare function migrateDeploy(options: MigrateDeployOptions): Promise<MigrateDeployResult>;
//# sourceMappingURL=migrate-deploy.d.ts.map
