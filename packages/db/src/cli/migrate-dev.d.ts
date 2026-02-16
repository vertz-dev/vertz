import type { MigrationQueryFn, SchemaSnapshot } from '../migration';
export interface RenameSuggestion {
  table: string;
  oldColumn: string;
  newColumn: string;
  confidence: number;
}
export interface MigrateDevOptions {
  queryFn: MigrationQueryFn;
  currentSnapshot: SchemaSnapshot;
  previousSnapshot: SchemaSnapshot;
  migrationName: string;
  existingFiles: string[];
  migrationsDir: string;
  writeFile: (path: string, content: string) => Promise<void>;
  dryRun: boolean;
}
export interface MigrateDevResult {
  migrationFile: string;
  sql: string;
  appliedAt?: Date;
  dryRun: boolean;
  renames?: RenameSuggestion[];
  snapshot: SchemaSnapshot;
}
/**
 * Generate a migration from schema diff, optionally apply it.
 *
 * In dry-run mode, generates SQL and returns it WITHOUT applying or writing files.
 */
export declare function migrateDev(options: MigrateDevOptions): Promise<MigrateDevResult>;
//# sourceMappingURL=migrate-dev.d.ts.map
