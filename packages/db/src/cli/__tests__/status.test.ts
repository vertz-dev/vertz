import { describe, expect, it, vi } from 'vitest';
import type { AppliedMigration, MigrationFile, MigrationQueryFn } from '../../migration';
import { migrateStatus } from '../status';

describe('migrateStatus', () => {
  it('returns applied and pending migrations', async () => {
    const applied: AppliedMigration[] = [
      { name: '0001_init.sql', checksum: 'abc', appliedAt: new Date('2024-01-01') },
    ];
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a;', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b;', timestamp: 2 },
    ];

    const queryFn: MigrationQueryFn = vi.fn().mockResolvedValue({
      rows: applied.map((a) => ({
        name: a.name,
        checksum: a.checksum,
        applied_at: a.appliedAt.toISOString(),
      })),
      rowCount: applied.length,
    });

    const result = await migrateStatus({ queryFn, migrationFiles: files });

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.name).toBe('0001_init.sql');
    expect(result.pending).toEqual(['0002_add_users.sql']);
  });

  it('returns all pending when none are applied', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a;', timestamp: 1 },
      { name: '0002_add_users.sql', sql: 'CREATE TABLE b;', timestamp: 2 },
    ];

    const queryFn: MigrationQueryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    });

    const result = await migrateStatus({ queryFn, migrationFiles: files });

    expect(result.applied).toHaveLength(0);
    expect(result.pending).toEqual(['0001_init.sql', '0002_add_users.sql']);
  });

  it('returns empty pending when all are applied', async () => {
    const files: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'CREATE TABLE a;', timestamp: 1 },
    ];

    const queryFn: MigrationQueryFn = vi.fn().mockResolvedValue({
      rows: [{ name: '0001_init.sql', checksum: 'abc', applied_at: '2024-01-01T00:00:00Z' }],
      rowCount: 1,
    });

    const result = await migrateStatus({ queryFn, migrationFiles: files });

    expect(result.applied).toHaveLength(1);
    expect(result.pending).toHaveLength(0);
  });
});
