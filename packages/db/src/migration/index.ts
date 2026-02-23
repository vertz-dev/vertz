export type { ChangeType, DiffChange, DiffResult } from './differ';
export { computeDiff } from './differ';
export { formatMigrationFilename, nextMigrationNumber } from './files';
export type {
  AppliedMigration,
  ApplyOptions,
  ApplyResult,
  MigrationFile,
  MigrationQueryFn,
  MigrationRunner,
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
export type { SqlGeneratorContext } from './sql-generator';
export { generateMigrationSql, generateRollbackSql } from './sql-generator';

export { autoMigrate, type AutoMigrateOptions } from './auto-migrate';

// Re-export MigrationError from @vertz/errors for convenience
export type { MigrationError } from '@vertz/errors';
