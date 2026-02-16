import type { MigrationFile, MigrationQueryFn } from '../migration';
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
export declare function migrateStatus(options: MigrateStatusOptions): Promise<MigrateStatusResult>;
//# sourceMappingURL=status.d.ts.map
