import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { unwrap } from '@vertz/errors';
import type { MigrationQueryFn, SchemaSnapshot } from '../../migration';
import { detectSchemaDrift, migrateStatus } from '../status';

function makeSnapshot(
  tables: Record<
    string,
    Record<string, { type: string; nullable?: boolean; primary?: boolean; unique?: boolean }>
  >,
): SchemaSnapshot {
  const snap: SchemaSnapshot = { version: 1, tables: {}, enums: {} };
  for (const [tableName, cols] of Object.entries(tables)) {
    const columns: Record<
      string,
      { type: string; nullable: boolean; primary: boolean; unique: boolean }
    > = {};
    for (const [colName, col] of Object.entries(cols)) {
      columns[colName] = {
        type: col.type,
        nullable: col.nullable ?? false,
        primary: col.primary ?? false,
        unique: col.unique ?? false,
      };
    }
    snap.tables[tableName] = {
      columns,
      indexes: [],
      foreignKeys: [],
      _metadata: {},
    };
  }
  return snap;
}

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

  describe('code changes detection', () => {
    it('returns empty codeChanges when snapshots match', async () => {
      const snapshot = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          name: { type: 'text' },
        },
      });

      const result = unwrap(
        await migrateStatus({
          queryFn,
          migrationFiles: [],
          savedSnapshot: snapshot,
          currentSnapshot: snapshot,
        }),
      );

      expect(result.codeChanges).toEqual([]);
    });

    it('detects added table in code not yet in migration', async () => {
      const savedSnapshot = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
      });
      const currentSnapshot = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
        posts: { id: { type: 'integer', primary: true } },
      });

      const result = unwrap(
        await migrateStatus({
          queryFn,
          migrationFiles: [],
          savedSnapshot,
          currentSnapshot,
        }),
      );

      expect(result.codeChanges).toHaveLength(1);
      expect(result.codeChanges[0]).toEqual({
        description: "Added table 'posts'",
        type: 'table_added',
        table: 'posts',
      });
    });

    it('detects added column in code not yet in migration', async () => {
      const savedSnapshot = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
      });
      const currentSnapshot = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          avatar: { type: 'text' },
        },
      });

      const result = unwrap(
        await migrateStatus({
          queryFn,
          migrationFiles: [],
          savedSnapshot,
          currentSnapshot,
        }),
      );

      expect(result.codeChanges).toHaveLength(1);
      expect(result.codeChanges[0]).toEqual({
        description: "Added column 'avatar' to table 'users'",
        type: 'column_added',
        table: 'users',
        column: 'avatar',
      });
    });

    it('returns empty codeChanges when no snapshots provided', async () => {
      const result = unwrap(
        await migrateStatus({
          queryFn,
          migrationFiles: [],
        }),
      );

      expect(result.codeChanges).toEqual([]);
    });
  });

  describe('drift detection (detectSchemaDrift)', () => {
    it('returns empty drift when schemas match', () => {
      const schema = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          name: { type: 'text' },
        },
      });

      const drift = detectSchemaDrift(schema, schema);

      expect(drift).toEqual([]);
    });

    it('detects extra table in database not in schema', () => {
      const expected = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
      });
      const actual = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
        temp_data: { id: { type: 'integer', primary: true } },
      });

      const drift = detectSchemaDrift(expected, actual);

      expect(drift).toHaveLength(1);
      expect(drift[0]).toEqual({
        description: "Table 'temp_data' exists in database but not in schema",
        type: 'extra_table',
        table: 'temp_data',
      });
    });

    it('detects missing table in database that exists in schema', () => {
      const expected = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
        posts: { id: { type: 'integer', primary: true } },
      });
      const actual = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
      });

      const drift = detectSchemaDrift(expected, actual);

      expect(drift).toHaveLength(1);
      expect(drift[0]).toEqual({
        description: "Table 'posts' exists in schema but not in database",
        type: 'missing_table',
        table: 'posts',
      });
    });

    it('detects extra column in database not in schema', () => {
      const expected = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
      });
      const actual = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          temp_flag: { type: 'boolean' },
        },
      });

      const drift = detectSchemaDrift(expected, actual);

      expect(drift).toHaveLength(1);
      expect(drift[0]).toEqual({
        description: "Column 'temp_flag' exists in database table 'users' but not in schema",
        type: 'extra_column',
        table: 'users',
        column: 'temp_flag',
      });
    });

    it('detects missing column in database that exists in schema', () => {
      const expected = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          email: { type: 'text' },
        },
      });
      const actual = makeSnapshot({
        users: { id: { type: 'integer', primary: true } },
      });

      const drift = detectSchemaDrift(expected, actual);

      expect(drift).toHaveLength(1);
      expect(drift[0]).toEqual({
        description: "Column 'email' exists in schema table 'users' but not in database",
        type: 'missing_column',
        table: 'users',
        column: 'email',
      });
    });

    it('detects column type mismatch', () => {
      const expected = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          age: { type: 'integer' },
        },
      });
      const actual = makeSnapshot({
        users: {
          id: { type: 'integer', primary: true },
          age: { type: 'text' },
        },
      });

      const drift = detectSchemaDrift(expected, actual);

      expect(drift).toHaveLength(1);
      expect(drift[0]).toEqual({
        description:
          "Column 'age' in table 'users' has type 'text' in database but 'integer' in schema",
        type: 'column_type_mismatch',
        table: 'users',
        column: 'age',
      });
    });
  });
});
