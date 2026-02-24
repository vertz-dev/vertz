import { describe, expect, it } from 'bun:test';
import { defaultPostgresDialect, defaultSqliteDialect } from '../../dialect';
import { generateMigrationSql, generateRollbackSql } from '../sql-generator';
import type { DiffChange } from '../differ';

describe('generateMigrationSql with PostgresDialect (regression)', () => {
  it('CREATE TABLE with PostgresDialect produces Postgres types', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'users',
      },
    ];
    const ctx = {
      tables: {
        users: {
          _name: 'users',
          columns: {
            id: { type: 'UUID', nullable: false, primary: true, unique: false, default: undefined },
            name: { type: 'TEXT', nullable: false, primary: false, unique: false, default: undefined },
            isActive: { type: 'BOOLEAN', nullable: true, primary: false, unique: false, default: undefined },
            createdAt: { type: 'TIMESTAMPTZ', nullable: false, primary: false, unique: false, default: undefined },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {},
    };

    const sql = generateMigrationSql(changes, ctx, defaultPostgresDialect);
    
    expect(sql).toContain('"id" UUID NOT NULL');
    expect(sql).toContain('"is_active" BOOLEAN');
    expect(sql).toContain('"created_at" TIMESTAMPTZ NOT NULL');
  });
});

describe('generateMigrationSql with SqliteDialect', () => {
  it('CREATE TABLE with SqliteDialect maps types correctly', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'users',
      },
    ];
    const ctx = {
      tables: {
        users: {
          _name: 'users',
          columns: {
            id: { type: 'UUID', nullable: false, primary: true, unique: false, default: undefined },
            name: { type: 'TEXT', nullable: false, primary: false, unique: false, default: undefined },
            isActive: { type: 'BOOLEAN', nullable: true, primary: false, unique: false, default: undefined },
            createdAt: { type: 'TIMESTAMPTZ', nullable: false, primary: false, unique: false, default: undefined },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {},
    };

    const sql = generateMigrationSql(changes, ctx, defaultSqliteDialect);
    
    // SQLite maps UUID -> TEXT, BOOLEAN -> INTEGER, TIMESTAMPTZ -> TEXT
    expect(sql).toContain('"id" TEXT NOT NULL');
    expect(sql).toContain('"is_active" INTEGER');
    expect(sql).toContain('"created_at" TEXT NOT NULL');
  });

  it('enum column on SQLite produces CHECK constraint', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'posts',
      },
    ];
    const ctx = {
      tables: {
        posts: {
          _name: 'posts',
          columns: {
            id: { type: 'TEXT', nullable: false, primary: true, unique: false, default: undefined },
            // Column type matches the enum name so it's detected as an enum
            status: { type: 'post_status', nullable: false, primary: false, unique: false, default: undefined },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {
        post_status: ['draft', 'published', 'archived'],
      },
    };

    const sql = generateMigrationSql(changes, ctx, defaultSqliteDialect);
    
    // SQLite should use CHECK constraint for enum values
    expect(sql).toContain('CHECK("status" IN (\'draft\', \'published\', \'archived\'))');
  });

  it('CREATE INDEX is identical for both dialects', () => {
    const changes: DiffChange[] = [
      {
        type: 'index_added',
        table: 'users',
        columns: ['email'],
      },
    ];
    const ctx = {
      tables: {},
      enums: {},
    };

    const pgSql = generateMigrationSql(changes, ctx, defaultPostgresDialect);
    const sqliteSql = generateMigrationSql(changes, ctx, defaultSqliteDialect);

    expect(pgSql).toBe(sqliteSql);
    expect(pgSql).toContain('CREATE INDEX');
    expect(pgSql).toContain('"email"');
  });
});

describe('generateMigrationSql with PostgresDialect', () => {
  it('enum column on Postgres produces CREATE TYPE', () => {
    const changes: DiffChange[] = [
      {
        type: 'enum_added',
        enumName: 'postStatus',
      },
      {
        type: 'table_added',
        table: 'posts',
      },
    ];
    const ctx = {
      tables: {
        posts: {
          _name: 'posts',
          columns: {
            id: { type: 'TEXT', nullable: false, primary: true, unique: false, default: undefined },
            status: { type: 'post_status', nullable: false, primary: false, unique: false, default: undefined },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {
        post_status: ['draft', 'published', 'archived'],
      },
    };

    const sql = generateMigrationSql(changes, ctx, defaultPostgresDialect);
    
    // Postgres should create enum type
    expect(sql).toContain('CREATE TYPE "post_status" AS ENUM');
    expect(sql).toContain('\'draft\', \'published\', \'archived\'');
  });
});

describe('generateMigrationSql backward compatibility', () => {
  it('works without dialect parameter (defaults to PostgresDialect)', () => {
    const changes: DiffChange[] = [
      {
        type: 'table_added',
        table: 'users',
      },
    ];
    const ctx = {
      tables: {
        users: {
          _name: 'users',
          columns: {
            id: { type: 'UUID', nullable: false, primary: true, unique: false, default: undefined },
          },
          foreignKeys: [],
          indexes: [],
        },
      },
      enums: {},
    };

    // Should work without the dialect parameter (defaults to PostgresDialect)
    const sql = generateMigrationSql(changes, ctx);
    
    expect(sql).toContain('"id" UUID NOT NULL');
  });
});
