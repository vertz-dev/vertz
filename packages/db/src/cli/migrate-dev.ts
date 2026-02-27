import type {
  CollisionInfo,
  DiffChange,
  Journal,
  MigrationQueryFn,
  SchemaSnapshot,
} from '../migration';
import {
  addJournalEntry,
  computeChecksum,
  computeDiff,
  createJournal,
  createMigrationRunner,
  detectCollisions,
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
  migrationName?: string;
  existingFiles: string[];
  migrationsDir: string;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile?: (path: string) => Promise<string>;
  dryRun: boolean;
}

export interface MigrateDevResult {
  migrationFile: string;
  sql: string;
  appliedAt?: Date;
  dryRun: boolean;
  renames?: RenameSuggestion[];
  collisions?: CollisionInfo[];
  snapshot: SchemaSnapshot;
}

function toKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function generateMigrationName(changes: DiffChange[]): string {
  if (changes.length === 0) return 'empty-migration';

  if (changes.length === 1) {
    const change = changes[0]!;
    switch (change.type) {
      case 'table_added':
        return `add-${toKebab(change.table!)}-table`;
      case 'table_removed':
        return `drop-${toKebab(change.table!)}-table`;
      case 'column_added':
        return `add-${toKebab(change.column!)}-to-${toKebab(change.table!)}`;
      case 'column_removed':
        return `drop-${toKebab(change.column!)}-from-${toKebab(change.table!)}`;
      case 'column_altered':
        return `alter-${toKebab(change.column!)}-in-${toKebab(change.table!)}`;
      case 'column_renamed':
        return `rename-${toKebab(change.oldColumn!)}-to-${toKebab(change.newColumn!)}-in-${toKebab(change.table!)}`;
      case 'index_added':
        return `add-index-to-${toKebab(change.table!)}`;
      case 'index_removed':
        return `drop-index-from-${toKebab(change.table!)}`;
      case 'enum_added':
        return `add-${toKebab(change.enumName!)}-enum`;
      case 'enum_removed':
        return `drop-${toKebab(change.enumName!)}-enum`;
      case 'enum_altered':
        return `alter-${toKebab(change.enumName!)}-enum`;
    }
  }

  // Multiple changes of same type on same table
  const tables = new Set(changes.map((c) => c.table).filter(Boolean));
  const types = new Set(changes.map((c) => c.type));

  if (tables.size === 1 && types.size === 1) {
    const table = [...tables][0]!;
    const type = [...types][0]!;
    switch (type) {
      case 'column_added':
        return `add-columns-to-${toKebab(table)}`;
      case 'column_removed':
        return `drop-columns-from-${toKebab(table)}`;
      default:
        return `update-${toKebab(table)}`;
    }
  }

  return 'update-schema';
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

  const migrationName = options.migrationName ?? generateMigrationName(diff.changes);
  const num = nextMigrationNumber(options.existingFiles);
  const filename = formatMigrationFilename(num, migrationName);
  const filePath = `${options.migrationsDir}/${filename}`;

  // Read journal for collision detection
  const journalPath = `${options.migrationsDir}/_journal.json`;
  let journal: Journal;
  try {
    const content = options.readFile
      ? await options.readFile(journalPath)
      : '{"version":1,"migrations":[]}';
    journal = JSON.parse(content) as Journal;
  } catch {
    journal = createJournal();
  }

  // Detect collisions between journal entries and existing files
  const collisions = detectCollisions(journal, options.existingFiles);

  if (options.dryRun) {
    return {
      migrationFile: filename,
      sql,
      dryRun: true,
      renames: renames.length > 0 ? renames : undefined,
      collisions: collisions.length > 0 ? collisions : undefined,
      snapshot: options.currentSnapshot,
    };
  }

  // Write migration file
  await options.writeFile(filePath, sql);

  // Write journal entry
  const checksum = await computeChecksum(sql);
  journal = addJournalEntry(journal, {
    name: filename,
    description: migrationName,
    createdAt: new Date().toISOString(),
    checksum,
  });
  await options.writeFile(journalPath, JSON.stringify(journal, null, 2));

  // Write snapshot
  const snapshotPath = `${options.migrationsDir}/_snapshot.json`;
  await options.writeFile(snapshotPath, JSON.stringify(options.currentSnapshot, null, 2));

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
    collisions: collisions.length > 0 ? collisions : undefined,
    snapshot: options.currentSnapshot,
  };
}
