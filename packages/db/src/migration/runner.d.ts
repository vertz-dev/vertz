/**
 * The query function type expected by the migration runner.
 */
export type MigrationQueryFn = (
  sql: string,
  params: readonly unknown[],
) => Promise<{
  rows: readonly Record<string, unknown>[];
  rowCount: number;
}>;
/**
 * Represents a migration that has been applied to the database.
 */
export interface AppliedMigration {
  name: string;
  appliedAt: Date;
  checksum: string;
}
/**
 * Represents a migration file on disk.
 */
export interface MigrationFile {
  name: string;
  sql: string;
  timestamp: number;
}
/**
 * Options for the apply method.
 */
export interface ApplyOptions {
  /** When true, return the SQL statements without executing them. */
  dryRun?: boolean;
}
/**
 * Result of applying (or dry-running) a migration.
 */
export interface ApplyResult {
  /** The migration name. */
  name: string;
  /** The SQL that was (or would be) executed. */
  sql: string;
  /** The computed checksum of the migration SQL. */
  checksum: string;
  /** Whether this was a dry run. */
  dryRun: boolean;
  /** The statements that were (or would be) executed, in order. */
  statements: string[];
}
/**
 * The migration runner interface.
 */
export interface MigrationRunner {
  createHistoryTable(queryFn: MigrationQueryFn): Promise<void>;
  apply(
    queryFn: MigrationQueryFn,
    sql: string,
    name: string,
    options?: ApplyOptions,
  ): Promise<ApplyResult>;
  getApplied(queryFn: MigrationQueryFn): Promise<AppliedMigration[]>;
  getPending(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[];
  detectDrift(files: MigrationFile[], applied: AppliedMigration[]): string[];
  detectOutOfOrder(files: MigrationFile[], applied: AppliedMigration[]): string[];
}
/**
 * Compute a SHA-256 checksum for migration SQL content.
 */
export declare function computeChecksum(sql: string): string;
/**
 * Parse a migration filename to extract its timestamp number.
 * Expected format: NNNN_description.sql
 */
export declare function parseMigrationName(filename: string): {
  timestamp: number;
  name: string;
} | null;
/**
 * Create a migration runner instance.
 */
export declare function createMigrationRunner(): MigrationRunner;
//# sourceMappingURL=runner.d.ts.map
