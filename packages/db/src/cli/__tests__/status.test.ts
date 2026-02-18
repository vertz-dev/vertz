import { PGlite } from '@electric-sql/pglite';
import { unwrap } from '@vertz/errors';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MigrationQueryFn } from '../../migration';
import { migrateStatus } from '../status';

describe('migrateStatus', () => {
  let db: PGlite;
  let queryFn: MigrationQueryFn;

  beforeEach(async () => {
    db = new PGlite();
    queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await db.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
    };
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns applied=[] and pending=[...] on a fresh database without crashing', async () => {
    const migrationFiles = [
      { name: '0001_init.sql', sql: 'CREATE TABLE users (id serial PRIMARY KEY);', timestamp: 1 },
      { name: '0002_add_email.sql', sql: 'ALTER TABLE users ADD COLUMN email text;', timestamp: 2 },
    ];

    const result = unwrap(await migrateStatus({ queryFn, migrationFiles }));

    expect(result.applied).toEqual([]);
    expect(result.pending).toEqual(['0001_init.sql', '0002_add_email.sql']);
  });

  it('returns correct status when some migrations are applied', async () => {
    // Manually create the history table and apply one migration
    await queryFn(
      `CREATE TABLE IF NOT EXISTS "_vertz_migrations" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL UNIQUE,
        "checksum" text NOT NULL,
        "applied_at" timestamp with time zone NOT NULL DEFAULT now()
      )`,
      [],
    );
    await queryFn('CREATE TABLE users (id serial PRIMARY KEY)', []);
    await queryFn(`INSERT INTO "_vertz_migrations" ("name", "checksum") VALUES ($1, $2)`, [
      '0001_init.sql',
      'abc123',
    ]);

    const migrationFiles = [
      { name: '0001_init.sql', sql: 'CREATE TABLE users (id serial PRIMARY KEY);', timestamp: 1 },
      { name: '0002_add_email.sql', sql: 'ALTER TABLE users ADD COLUMN email text;', timestamp: 2 },
    ];

    const result = unwrap(await migrateStatus({ queryFn, migrationFiles }));

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.name).toBe('0001_init.sql');
    expect(result.pending).toEqual(['0002_add_email.sql']);
  });
});
