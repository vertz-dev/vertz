/**
 * Migration domain errors.
 *
 * These errors are returned from migration operations and represent
 * expected runtime failures that require case-by-case handling.
 */

// ============================================================================
// Migration Errors
// ============================================================================

/**
 * Migration query execution failed.
 *
 * Returned when a migration SQL statement fails to execute.
 */
export interface MigrationQueryError {
  readonly code: 'MIGRATION_QUERY_ERROR';
  readonly message: string;
  readonly sql?: string;
  readonly cause?: unknown;
}

/**
 * Creates a MigrationQueryError.
 */
export function createMigrationQueryError(
  message: string,
  options?: { sql?: string; cause?: unknown },
): MigrationQueryError {
  return {
    code: 'MIGRATION_QUERY_ERROR',
    message,
    ...options,
  };
}

/**
 * Type guard for MigrationQueryError.
 */
export function isMigrationQueryError(
  error: { readonly code: string },
): error is MigrationQueryError {
  return error.code === 'MIGRATION_QUERY_ERROR';
}

/**
 * Migration checksum mismatch detected.
 *
 * Returned when an applied migration's checksum doesn't match the file on disk.
 */
export interface MigrationChecksumMismatch {
  readonly code: 'MIGRATION_CHECKSUM_MISMATCH';
  readonly message: string;
  readonly migrationName: string;
  readonly expectedChecksum: string;
  readonly actualChecksum: string;
}

/**
 * Creates a MigrationChecksumMismatch error.
 */
export function createMigrationChecksumMismatch(
  migrationName: string,
  expectedChecksum: string,
  actualChecksum: string,
): MigrationChecksumMismatch {
  return {
    code: 'MIGRATION_CHECKSUM_MISMATCH',
    message: `Migration ${migrationName} has been modified after being applied (expected: ${expectedChecksum}, actual: ${actualChecksum})`,
    migrationName,
    expectedChecksum,
    actualChecksum,
  };
}

/**
 * Type guard for MigrationChecksumMismatch.
 */
export function isMigrationChecksumMismatch(
  error: { readonly code: string },
): error is MigrationChecksumMismatch {
  return error.code === 'MIGRATION_CHECKSUM_MISMATCH';
}

/**
 * Migration history table not found.
 *
 * Returned when attempting to query migration history before the table exists.
 */
export interface MigrationHistoryNotFound {
  readonly code: 'MIGRATION_HISTORY_NOT_FOUND';
  readonly message: string;
}

/**
 * Creates a MigrationHistoryNotFound error.
 */
export function createMigrationHistoryNotFound(): MigrationHistoryNotFound {
  return {
    code: 'MIGRATION_HISTORY_NOT_FOUND',
    message: 'Migration history table does not exist. Run createHistoryTable() first.',
  };
}

/**
 * Type guard for MigrationHistoryNotFound.
 */
export function isMigrationHistoryNotFound(
  error: { readonly code: string },
): error is MigrationHistoryNotFound {
  return error.code === 'MIGRATION_HISTORY_NOT_FOUND';
}

/**
 * Union type for all migration errors.
 */
export type MigrationError =
  | MigrationQueryError
  | MigrationChecksumMismatch
  | MigrationHistoryNotFound;
