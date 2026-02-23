import type { SchemaSnapshot } from './snapshot';
import { computeDiff, type DiffChange } from './differ';
import { generateMigrationSql } from './sql-generator';
import { createMigrationRunner, type MigrationQueryFn } from './runner';
import { loadSnapshot, saveSnapshot } from './snapshot-storage';
import { defaultSqliteDialect } from '../dialect';
import { isErr } from '@vertz/errors';

/**
 * Types of changes that are considered destructive (data loss).
 */
const DESTRUCTIVE_CHANGE_TYPES: DiffChange['type'][] = [
  'table_removed',
  'column_removed',
];

/**
 * Check if a change is destructive (causes data loss).
 */
function isDestructiveChange(change: DiffChange): boolean {
  return DESTRUCTIVE_CHANGE_TYPES.includes(change.type);
}

/**
 * Options for autoMigrate.
 */
export interface AutoMigrateOptions {
  /** The current schema snapshot (from d.table() definitions). */
  currentSchema: SchemaSnapshot;
  /** Path to the snapshot file for persistence. */
  snapshotPath: string;
  /** Database dialect - currently only 'sqlite' is supported. */
  dialect: 'sqlite';
  /** Database connection that can execute SQL queries. */
  db: MigrationQueryFn;
}

/**
 * Auto-migrate the database schema.
 *
 * This function:
 * 1. Loads the previous snapshot from disk (if any)
 * 2. Compares against the current schema
 * 3. Generates and applies migration SQL
 * 4. Logs warnings for destructive changes
 * 5. Saves the updated snapshot
 *
 * @param options - Migration options
 */
export async function autoMigrate(options: AutoMigrateOptions): Promise<void> {
  const { currentSchema, snapshotPath, db } = options;

  // Load previous snapshot
  const previousSnapshot = await loadSnapshot(snapshotPath);

  // Get the appropriate dialect
  const dialectObj = defaultSqliteDialect;

  // Create migration runner
  const runner = createMigrationRunner();

  // Ensure history table exists
  await runner.createHistoryTable(db);

  if (!previousSnapshot) {
    // First run: apply full schema
    console.log('[auto-migrate] No previous snapshot found. Applying full schema...');

    // Generate SQL for all tables (treat as all-added)
    const diff = computeDiff({ version: 1, tables: {}, enums: {} }, currentSchema);

    if (diff.changes.length > 0) {
      // Log any destructive changes even on first run (unlikely but possible)
      for (const change of diff.changes) {
        if (isDestructiveChange(change)) {
          console.warn(
            `[auto-migrate] Warning: Destructive change detected on first run: ${change.type}`,
          );
        }
      }

      const sql = generateMigrationSql(diff.changes, {
        tables: currentSchema.tables,
        enums: currentSchema.enums,
      }, dialectObj);

      if (sql.trim()) {
        const result = await runner.apply(db, sql, 'auto-migrate-initial');
        if (isErr(result)) {
          const error = result.error;
          const errorMessage = typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: unknown }).message
            : String(error);
          const cause = typeof error === 'object' && error !== null && 'cause' in error
            ? (error as { cause: unknown }).cause
            : undefined;
          const causeStr = cause ? ` (cause: ${String(cause)})` : '';
          throw new Error(`Failed to apply initial schema: ${errorMessage}${causeStr}`);
        }
        console.log('[auto-migrate] Initial schema applied successfully.');
      }
    } else {
      console.log('[auto-migrate] No schema changes to apply.');
    }
  } else {
    // Subsequent run: diff against previous
    console.log('[auto-migrate] Previous snapshot found. Computing diff...');

    const diff = computeDiff(previousSnapshot, currentSchema);

    if (diff.changes.length === 0) {
      console.log('[auto-migrate] No schema changes detected.');
    } else {
      // Log warnings for destructive changes
      const destructiveChanges = diff.changes.filter(isDestructiveChange);
      for (const change of destructiveChanges) {
        let details = '';
        if (change.type === 'table_removed' && change.table) {
          details = ` (table: ${change.table})`;
        } else if (change.type === 'column_removed' && change.table && change.column) {
          details = ` (table: ${change.table}, column: ${change.column})`;
        }
        console.warn(
          `[auto-migrate] ⚠️  Warning: Destructive change detected${details}: ${change.type}`,
        );
      }

      const sql = generateMigrationSql(diff.changes, {
        tables: currentSchema.tables,
        enums: currentSchema.enums,
      }, dialectObj);

      if (sql.trim()) {
        const result = await runner.apply(db, sql, `auto-migrate-${Date.now()}`);
        if (isErr(result)) {
          const error = result.error;
          const errorMessage = typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: unknown }).message
            : String(error);
          const cause = typeof error === 'object' && error !== null && 'cause' in error
            ? (error as { cause: unknown }).cause
            : undefined;
          const causeStr = cause ? ` (cause: ${String(cause)})` : '';
          throw new Error(`Failed to apply migration: ${errorMessage}${causeStr}`);
        }
        console.log(`[auto-migrate] Applied ${diff.changes.length} change(s).`);
      }
    }
  }

  // Save updated snapshot
  await saveSnapshot(snapshotPath, currentSchema);
  console.log('[auto-migrate] Snapshot saved.');
}
