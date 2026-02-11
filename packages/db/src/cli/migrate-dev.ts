import type { MigrationQueryFn, SchemaSnapshot } from '../migration';
import {
  computeDiff,
  createMigrationRunner,
  formatMigrationFilename,
  generateMigrationSql,
  nextMigrationNumber,
} from '../migration';

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
export async function migrateDev(options: MigrateDevOptions): Promise<MigrateDevResult> {
  const diff = computeDiff(options.previousSnapshot, options.currentSnapshot);

  const sql = generateMigrationSql(diff.changes, {
    tables: options.currentSnapshot.tables,
    enums: options.currentSnapshot.enums,
  });

  // Extract rename suggestions
  const renames: RenameSuggestion[] = diff.changes
    .filter((c) => c.type === 'column_renamed')
    .map((c) => ({
      table: c.table as string,
      oldColumn: c.oldColumn as string,
      newColumn: c.newColumn as string,
      confidence: c.confidence as number,
    }));

  const num = nextMigrationNumber(options.existingFiles);
  const filename = formatMigrationFilename(num, options.migrationName);
  const filePath = `${options.migrationsDir}/${filename}`;

  if (options.dryRun) {
    return {
      migrationFile: filename,
      sql,
      dryRun: true,
      renames: renames.length > 0 ? renames : undefined,
      snapshot: options.currentSnapshot,
    };
  }

  // Write migration file
  await options.writeFile(filePath, sql);

  // Apply migration
  const runner = createMigrationRunner();
  await runner.createHistoryTable(options.queryFn);
  await runner.apply(options.queryFn, sql, filename, { dryRun: false });

  return {
    migrationFile: filename,
    sql,
    appliedAt: new Date(),
    dryRun: false,
    renames: renames.length > 0 ? renames : undefined,
    snapshot: options.currentSnapshot,
  };
}
