import { describe, expect, it, vi } from 'vitest';
import type { MigrationQueryFn, SchemaSnapshot } from '../../migration';
import { push } from '../push';

describe('push', () => {
  it('generates and applies SQL without creating a migration file', async () => {
    const currentSnapshot: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            email: { type: 'text', nullable: false, primary: false, unique: true },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const previousSnapshot: SchemaSnapshot = {
      version: 1,
      tables: {},
      enums: {},
    };

    const executedSql: string[] = [];
    const queryFn: MigrationQueryFn = vi.fn().mockImplementation(async (sql: string) => {
      executedSql.push(sql);
      return { rows: [], rowCount: 0 };
    });

    const result = await push({
      queryFn,
      currentSnapshot,
      previousSnapshot,
    });

    expect(result.sql).toContain('CREATE TABLE');
    expect(result.tablesAffected).toContain('users');
    // The SQL should have been executed
    expect(executedSql.some((s) => s.includes('CREATE TABLE'))).toBe(true);
  });

  it('returns empty SQL and no affected tables when schemas are identical', async () => {
    const snapshot: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const queryFn: MigrationQueryFn = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await push({
      queryFn,
      currentSnapshot: snapshot,
      previousSnapshot: snapshot,
    });

    expect(result.sql).toBe('');
    expect(result.tablesAffected).toEqual([]);
    // queryFn should NOT have been called for SQL execution (only empty sql)
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('detects column additions', async () => {
    const previous: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const current: SchemaSnapshot = {
      version: 1,
      tables: {
        users: {
          columns: {
            id: { type: 'uuid', nullable: false, primary: true, unique: false },
            name: { type: 'text', nullable: false, primary: false, unique: false },
          },
          indexes: [],
          foreignKeys: [],
          _metadata: {},
        },
      },
      enums: {},
    };

    const queryFn: MigrationQueryFn = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await push({
      queryFn,
      currentSnapshot: current,
      previousSnapshot: previous,
    });

    expect(result.sql).toContain('ADD COLUMN');
    expect(result.tablesAffected).toContain('users');
  });
});
