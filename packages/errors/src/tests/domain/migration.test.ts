import { describe, expect, it } from 'vitest';
import {
  createMigrationChecksumMismatch,
  createMigrationHistoryNotFound,
  createMigrationQueryError,
  isMigrationChecksumMismatch,
  isMigrationHistoryNotFound,
  isMigrationQueryError,
  type MigrationError,
} from '../../domain/migration';

describe('domain/migration', () => {
  describe('MigrationQueryError', () => {
    it('creates error with code MIGRATION_QUERY_ERROR and provided message', () => {
      const error = createMigrationQueryError('INSERT INTO failed');
      expect(error.code).toBe('MIGRATION_QUERY_ERROR');
      expect(error.message).toBe('INSERT INTO failed');
    });

    it('includes sql and cause when options are provided', () => {
      const cause = new Error('connection lost');
      const error = createMigrationQueryError('Query failed', {
        sql: 'ALTER TABLE users ADD COLUMN age INT',
        cause,
      });
      expect(error.sql).toBe('ALTER TABLE users ADD COLUMN age INT');
      expect(error.cause).toBe(cause);
    });

    it('omits sql and cause when options are not provided', () => {
      const error = createMigrationQueryError('Query failed');
      expect(error.sql).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('isMigrationQueryError returns true for MigrationQueryError', () => {
      const error = createMigrationQueryError('Query failed');
      expect(isMigrationQueryError(error)).toBe(true);
    });

    it('isMigrationQueryError returns false for other error codes', () => {
      const error = createMigrationHistoryNotFound();
      expect(isMigrationQueryError(error)).toBe(false);
    });
  });

  describe('MigrationChecksumMismatch', () => {
    it('creates error with code MIGRATION_CHECKSUM_MISMATCH and all properties', () => {
      const error = createMigrationChecksumMismatch('001_create_users', 'abc123', 'def456');
      expect(error.code).toBe('MIGRATION_CHECKSUM_MISMATCH');
      expect(error.migrationName).toBe('001_create_users');
      expect(error.expectedChecksum).toBe('abc123');
      expect(error.actualChecksum).toBe('def456');
    });

    it('generates a descriptive message with migration name and checksums', () => {
      const error = createMigrationChecksumMismatch('001_create_users', 'abc123', 'def456');
      expect(error.message).toBe(
        'Migration 001_create_users has been modified after being applied (expected: abc123, actual: def456)',
      );
    });

    it('isMigrationChecksumMismatch returns true for MigrationChecksumMismatch', () => {
      const error = createMigrationChecksumMismatch('m1', 'a', 'b');
      expect(isMigrationChecksumMismatch(error)).toBe(true);
    });

    it('isMigrationChecksumMismatch returns false for other error codes', () => {
      const error = createMigrationQueryError('Query failed');
      expect(isMigrationChecksumMismatch(error)).toBe(false);
    });
  });

  describe('MigrationHistoryNotFound', () => {
    it('creates error with code MIGRATION_HISTORY_NOT_FOUND', () => {
      const error = createMigrationHistoryNotFound();
      expect(error.code).toBe('MIGRATION_HISTORY_NOT_FOUND');
    });

    it('has a fixed message instructing to run createHistoryTable()', () => {
      const error = createMigrationHistoryNotFound();
      expect(error.message).toBe(
        'Migration history table does not exist. Run createHistoryTable() first.',
      );
    });

    it('isMigrationHistoryNotFound returns true for MigrationHistoryNotFound', () => {
      const error = createMigrationHistoryNotFound();
      expect(isMigrationHistoryNotFound(error)).toBe(true);
    });

    it('isMigrationHistoryNotFound returns false for other error codes', () => {
      const error = createMigrationChecksumMismatch('m1', 'a', 'b');
      expect(isMigrationHistoryNotFound(error)).toBe(false);
    });
  });

  describe('MigrationError union type', () => {
    it('accepts all migration error types', () => {
      const query: MigrationError = createMigrationQueryError('Failed');
      const checksum: MigrationError = createMigrationChecksumMismatch('m1', 'a', 'b');
      const history: MigrationError = createMigrationHistoryNotFound();

      expect(query.code).toBe('MIGRATION_QUERY_ERROR');
      expect(checksum.code).toBe('MIGRATION_CHECKSUM_MISMATCH');
      expect(history.code).toBe('MIGRATION_HISTORY_NOT_FOUND');
    });
  });
});
