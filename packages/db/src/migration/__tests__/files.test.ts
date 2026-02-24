import { describe, expect, it } from 'bun:test';
import { formatMigrationFilename, nextMigrationNumber } from '../files';

describe('formatMigrationFilename', () => {
  it('formats a migration filename with zero-padded number', () => {
    expect(formatMigrationFilename(1, 'initial')).toBe('0001_initial.sql');
    expect(formatMigrationFilename(42, 'add_user_bio')).toBe('0042_add_user_bio.sql');
    expect(formatMigrationFilename(100, 'drop_legacy')).toBe('0100_drop_legacy.sql');
  });
});

describe('nextMigrationNumber', () => {
  it('returns 1 when no existing migrations', () => {
    expect(nextMigrationNumber([])).toBe(1);
  });

  it('returns next number after highest existing', () => {
    expect(nextMigrationNumber(['0001_initial.sql', '0002_add_email.sql'])).toBe(3);
  });

  it('handles gaps in numbering', () => {
    expect(nextMigrationNumber(['0001_initial.sql', '0005_jump.sql'])).toBe(6);
  });
});
