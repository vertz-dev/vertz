import { Database } from 'bun:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { introspectPostgres, introspectSqlite } from '../introspect';
import type { MigrationQueryFn } from '../runner';

function createSqliteQueryFn(db: Database): MigrationQueryFn {
  return async (sql: string, params: readonly unknown[]) => {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return { rows, rowCount: rows.length };
  };
}

describe('introspectSqlite', () => {
  let db: Database;
  let queryFn: MigrationQueryFn;

  beforeEach(() => {
    db = new Database(':memory:');
    queryFn = createSqliteQueryFn(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty snapshot for empty database', async () => {
    const snapshot = await introspectSqlite(queryFn);
    expect(snapshot).toEqual({
      version: 1,
      tables: {},
      enums: {},
    });
  });

  it('introspects a single table with columns', async () => {
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        score REAL,
        data BLOB
      )
    `);

    const snapshot = await introspectSqlite(queryFn);

    expect(snapshot.tables.users).toBeDefined();
    const cols = snapshot.tables.users?.columns;
    expect(cols?.id).toEqual({ type: 'integer', nullable: false, primary: true, unique: false });
    expect(cols?.name).toEqual({ type: 'text', nullable: false, primary: false, unique: false });
    expect(cols?.score).toEqual({ type: 'float', nullable: true, primary: false, unique: false });
    expect(cols?.data).toEqual({ type: 'blob', nullable: true, primary: false, unique: false });
  });

  it('detects default values', async () => {
    db.run(`
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY,
        theme TEXT NOT NULL DEFAULT 'dark',
        count INTEGER DEFAULT 0
      )
    `);

    const snapshot = await introspectSqlite(queryFn);
    const cols = snapshot.tables.settings?.columns;

    expect(cols?.theme?.default).toBe("'dark'");
    expect(cols?.count?.default).toBe('0');
    expect(cols?.id?.default).toBeUndefined();
  });

  it('detects unique constraints', async () => {
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      )
    `);

    const snapshot = await introspectSqlite(queryFn);
    const cols = snapshot.tables.users?.columns;

    expect(cols?.email?.unique).toBe(true);
    expect(cols?.name?.unique).toBe(false);
  });

  it('detects foreign keys', async () => {
    db.run('PRAGMA foreign_keys = ON');
    db.run(`
      CREATE TABLE authors (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES authors(id),
        title TEXT NOT NULL
      )
    `);

    const snapshot = await introspectSqlite(queryFn);
    const fks = snapshot.tables.posts?.foreignKeys;

    expect(fks).toHaveLength(1);
    expect(fks?.[0]).toEqual({
      column: 'author_id',
      targetTable: 'authors',
      targetColumn: 'id',
    });
  });

  it('detects indexes', async () => {
    db.run(`
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL
      )
    `);
    db.run('CREATE INDEX idx_articles_title ON articles(title)');
    db.run('CREATE UNIQUE INDEX idx_articles_slug ON articles(slug)');

    const snapshot = await introspectSqlite(queryFn);
    const indexes = snapshot.tables.articles?.indexes;

    expect(indexes).toHaveLength(2);

    const titleIdx = indexes?.find((i) => i.name === 'idx_articles_title');
    expect(titleIdx).toEqual({
      columns: ['title'],
      name: 'idx_articles_title',
      unique: false,
    });

    const slugIdx = indexes?.find((i) => i.name === 'idx_articles_slug');
    expect(slugIdx).toEqual({
      columns: ['slug'],
      name: 'idx_articles_slug',
      unique: true,
    });
  });

  it('excludes internal tables', async () => {
    db.run(`
      CREATE TABLE _vertz_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE real_table (
        id INTEGER PRIMARY KEY
      )
    `);

    const snapshot = await introspectSqlite(queryFn);

    expect(snapshot.tables._vertz_migrations).toBeUndefined();
    expect(snapshot.tables.real_table).toBeDefined();
  });
});

describe('introspectPostgres', () => {
  let db: PGlite;
  let queryFn: MigrationQueryFn;

  beforeAll(async () => {
    db = new PGlite();
    queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await db.query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
    };
  });

  afterAll(async () => {
    await db.close();
  });

  it('returns empty snapshot for empty database', async () => {
    const snapshot = await introspectPostgres(queryFn);
    expect(snapshot).toEqual({
      version: 1,
      tables: {},
      enums: {},
    });
  });

  it('introspects a table with columns and types', async () => {
    await db.exec(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        age integer,
        score real,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    const snapshot = await introspectPostgres(queryFn);

    expect(snapshot.tables.users).toBeDefined();
    const cols = snapshot.tables.users?.columns;
    expect(cols?.id).toEqual({ type: 'uuid', nullable: false, primary: true, unique: false });
    expect(cols?.name).toEqual({ type: 'text', nullable: false, primary: false, unique: false });
    expect(cols?.email).toEqual({ type: 'text', nullable: false, primary: false, unique: true });
    expect(cols?.age).toEqual({ type: 'integer', nullable: true, primary: false, unique: false });
    expect(cols?.score).toEqual({ type: 'real', nullable: true, primary: false, unique: false });
    expect(cols?.active).toEqual({
      type: 'boolean',
      nullable: false,
      primary: false,
      unique: false,
      default: 'true',
    });
    expect(cols?.created_at).toEqual({
      type: 'timestamp with time zone',
      nullable: false,
      primary: false,
      unique: false,
      default: 'now()',
    });
  });

  it('detects foreign keys', async () => {
    await db.exec(`
      CREATE TABLE posts (
        id uuid PRIMARY KEY,
        author_id uuid NOT NULL REFERENCES users(id),
        title text NOT NULL
      )
    `);

    const snapshot = await introspectPostgres(queryFn);
    const fks = snapshot.tables.posts?.foreignKeys;

    expect(fks).toHaveLength(1);
    expect(fks?.[0]).toEqual({
      column: 'author_id',
      targetTable: 'users',
      targetColumn: 'id',
    });
  });

  it('detects indexes', async () => {
    await db.exec('CREATE INDEX idx_users_name ON users(name)');
    await db.exec('CREATE INDEX idx_posts_title ON posts(title)');

    const snapshot = await introspectPostgres(queryFn);
    const userIndexes = snapshot.tables.users?.indexes;

    const nameIdx = userIndexes?.find((i) => i.name === 'idx_users_name');
    expect(nameIdx).toEqual({
      columns: ['name'],
      name: 'idx_users_name',
      unique: false,
    });

    const postIndexes = snapshot.tables.posts?.indexes;
    const titleIdx = postIndexes?.find((i) => i.name === 'idx_posts_title');
    expect(titleIdx).toEqual({
      columns: ['title'],
      name: 'idx_posts_title',
      unique: false,
    });
  });

  it('excludes internal tables', async () => {
    await db.exec(`
      CREATE TABLE _vertz_migrations (
        id serial PRIMARY KEY,
        name text NOT NULL
      )
    `);

    const snapshot = await introspectPostgres(queryFn);

    expect(snapshot.tables._vertz_migrations).toBeUndefined();
    expect(snapshot.tables.users).toBeDefined();
  });

  it('detects enum types', async () => {
    await db.exec(`
      CREATE TYPE status AS ENUM ('active', 'inactive', 'pending')
    `);
    await db.exec(`
      CREATE TABLE tasks (
        id uuid PRIMARY KEY,
        status status NOT NULL DEFAULT 'pending'
      )
    `);

    const snapshot = await introspectPostgres(queryFn);

    expect(snapshot.enums.status).toEqual(['active', 'inactive', 'pending']);
    expect(snapshot.tables.tasks?.columns?.status?.type).toBe('USER-DEFINED');
  });
});
