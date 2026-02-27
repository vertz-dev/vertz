// Re-export MigrationError from @vertz/errors for convenience
export type { MigrationError } from '@vertz/errors';
export { type AutoMigrateOptions, autoMigrate } from './auto-migrate';
export type { ChangeType, DiffChange, DiffResult } from './differ';
export { computeDiff } from './differ';
export { formatMigrationFilename, nextMigrationNumber } from './files';
export { introspectPostgres, introspectSqlite } from './introspect';
export type { CollisionInfo, Journal, JournalEntry } from './journal';
export {
  addJournalEntry,
  createJournal,
  detectCollisions,
  readJournal,
  writeJournal,
} from './journal';
export type {
  AppliedMigration,
  ApplyOptions,
  ApplyResult,
  MigrationFile,
  MigrationQueryFn,
  MigrationRunner,
  MigrationRunnerOptions,
} from './runner';
export { computeChecksum, createMigrationRunner, parseMigrationName } from './runner';
export type {
  ColumnSnapshot,
  ForeignKeySnapshot,
  IndexSnapshot,
  SchemaSnapshot,
  TableSnapshot,
} from './snapshot';
export { createSnapshot } from './snapshot';
export { NodeSnapshotStorage } from './snapshot-storage';
export type { SqlGeneratorContext } from './sql-generator';
export { generateMigrationSql, generateRollbackSql } from './sql-generator';
export type { SnapshotStorage } from './storage';
