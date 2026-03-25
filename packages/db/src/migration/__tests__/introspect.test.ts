import { Database } from 'bun:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { introspectPostgres, introspectSqlite, validateIdentifier } from '../introspect';
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

  it('detects partial indexes with WHERE clause', async () => {
    db.run(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        title TEXT NOT NULL
      )
    `);
    db.run("CREATE INDEX idx_tasks_status ON tasks(status) WHERE status = 'active'");

    const snapshot = await introspectSqlite(queryFn);
    const indexes = snapshot.tables.tasks?.indexes;

    const statusIdx = indexes?.find((i) => i.name === 'idx_tasks_status');
    expect(statusIdx?.where).toBe("status = 'active'");
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
    expect(cols?.id).toMatchObject({
      type: 'uuid',
      nullable: false,
      primary: true,
      unique: false,
      udtName: 'uuid',
    });
    expect(cols?.name).toMatchObject({
      type: 'text',
      nullable: false,
      primary: false,
      unique: false,
      udtName: 'text',
    });
    expect(cols?.email).toMatchObject({
      type: 'text',
      nullable: false,
      primary: false,
      unique: true,
      udtName: 'text',
    });
    expect(cols?.age).toMatchObject({
      type: 'integer',
      nullable: true,
      primary: false,
      unique: false,
      udtName: 'int4',
    });
    expect(cols?.score).toMatchObject({
      type: 'real',
      nullable: true,
      primary: false,
      unique: false,
      udtName: 'float4',
    });
    expect(cols?.active).toMatchObject({
      type: 'boolean',
      nullable: false,
      primary: false,
      unique: false,
      default: 'true',
      udtName: 'bool',
    });
    expect(cols?.created_at).toMatchObject({
      type: 'timestamp with time zone',
      nullable: false,
      primary: false,
      unique: false,
      default: 'now()',
      udtName: 'timestamptz',
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

  it('detects unique indexes', async () => {
    await db.exec('CREATE UNIQUE INDEX idx_posts_slug ON posts(title, author_id)');

    const snapshot = await introspectPostgres(queryFn);
    const postIndexes = snapshot.tables.posts?.indexes;

    const slugIdx = postIndexes?.find((i) => i.name === 'idx_posts_slug');
    expect(slugIdx).toEqual({
      columns: ['title', 'author_id'],
      name: 'idx_posts_slug',
      unique: true,
    });
  });

  it('detects index access method (type) and partial index predicate', async () => {
    await db.exec('CREATE INDEX idx_users_name_hash ON users USING hash (name)');
    await db.exec("CREATE INDEX idx_posts_title_partial ON posts(title) WHERE title != 'draft'");

    const snapshot = await introspectPostgres(queryFn);

    const hashIdx = snapshot.tables.users?.indexes?.find((i) => i.name === 'idx_users_name_hash');
    expect(hashIdx?.type).toBe('hash');
    expect(hashIdx?.where).toBeUndefined();

    const partialIdx = snapshot.tables.posts?.indexes?.find(
      (i) => i.name === 'idx_posts_title_partial',
    );
    expect(partialIdx?.where).toBeDefined();
    expect(partialIdx?.where).toContain('draft');
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

  it('captures udtName for enum columns', async () => {
    const snapshot = await introspectPostgres(queryFn);
    expect(snapshot.tables.tasks?.columns?.status?.udtName).toBe('status');
  });

  it('captures character_maximum_length for varchar columns', async () => {
    await db.exec(`
      CREATE TABLE profiles (
        id uuid PRIMARY KEY,
        display_name varchar(100) NOT NULL,
        bio varchar(500)
      )
    `);

    const snapshot = await introspectPostgres(queryFn);
    const cols = snapshot.tables.profiles?.columns;
    expect(cols?.display_name?.length).toBe(100);
    expect(cols?.bio?.length).toBe(500);
  });

  it('captures numeric_precision and numeric_scale for decimal columns', async () => {
    await db.exec(`
      CREATE TABLE products (
        id uuid PRIMARY KEY,
        price numeric(10, 2) NOT NULL,
        weight numeric(5, 3)
      )
    `);

    const snapshot = await introspectPostgres(queryFn);
    const cols = snapshot.tables.products?.columns;
    expect(cols?.price?.precision).toBe(10);
    expect(cols?.price?.scale).toBe(2);
    expect(cols?.weight?.precision).toBe(5);
    expect(cols?.weight?.scale).toBe(3);
  });

  it('captures udtName for array columns', async () => {
    await db.exec(`
      CREATE TABLE tags (
        id uuid PRIMARY KEY,
        labels text[] NOT NULL,
        scores integer[]
      )
    `);

    const snapshot = await introspectPostgres(queryFn);
    const cols = snapshot.tables.tags?.columns;
    expect(cols?.labels?.udtName).toBe('_text');
    expect(cols?.scores?.udtName).toBe('_int4');
  });
});

// ---------------------------------------------------------------------------
// validateIdentifier — SQL injection prevention
// ---------------------------------------------------------------------------

describe('validateIdentifier', () => {
  describe('accepts valid SQL identifiers', () => {
    it('accepts simple lowercase name', () => {
      expect(validateIdentifier('users')).toBe('users');
    });

    it('accepts name with underscore', () => {
      expect(validateIdentifier('user_profile')).toBe('user_profile');
    });

    it('accepts name starting with underscore', () => {
      expect(validateIdentifier('_private')).toBe('_private');
    });

    it('accepts name with digits', () => {
      expect(validateIdentifier('table2')).toBe('table2');
    });

    it('accepts uppercase name', () => {
      expect(validateIdentifier('Users')).toBe('Users');
    });

    it('accepts mixed case with underscores and digits', () => {
      expect(validateIdentifier('User_Profile_v2')).toBe('User_Profile_v2');
    });
  });

  describe('rejects dangerous identifiers', () => {
    it('rejects SQL injection with semicolon', () => {
      expect(() => validateIdentifier('users; DROP TABLE')).toThrow('Invalid SQL identifier');
    });

    it('rejects name with double quotes', () => {
      expect(() => validateIdentifier('table"name')).toThrow('Invalid SQL identifier');
    });

    it('rejects path traversal attempt', () => {
      expect(() => validateIdentifier('../etc')).toThrow('Invalid SQL identifier');
    });

    it('rejects name with spaces', () => {
      expect(() => validateIdentifier('table name')).toThrow('Invalid SQL identifier');
    });

    it('rejects empty string', () => {
      expect(() => validateIdentifier('')).toThrow('Invalid SQL identifier');
    });

    it('rejects name starting with a digit', () => {
      expect(() => validateIdentifier('1table')).toThrow('Invalid SQL identifier');
    });

    it('rejects name with single quotes', () => {
      expect(() => validateIdentifier("table'name")).toThrow('Invalid SQL identifier');
    });

    it('rejects name with parentheses', () => {
      expect(() => validateIdentifier('table(name)')).toThrow('Invalid SQL identifier');
    });

    it('rejects name with dashes', () => {
      expect(() => validateIdentifier('table-name')).toThrow('Invalid SQL identifier');
    });
  });
});
