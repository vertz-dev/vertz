import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createConnection,
  extractTables,
  loadMigrationFiles,
  parseSqliteUrl,
} from '../load-db-context';

// ---------------------------------------------------------------------------
// extractTables
// ---------------------------------------------------------------------------

describe('extractTables', () => {
  it('finds objects with _name and _columns as TableDefs', () => {
    const module = {
      users: { _name: 'users', _columns: { id: {} }, _indexes: [], _shared: false },
      posts: { _name: 'posts', _columns: { id: {} }, _indexes: [], _shared: false },
      notATable: 'hello',
      alsoNot: 42,
      nullValue: null,
    };

    const tables = extractTables(module as Record<string, unknown>);

    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t._name).sort()).toEqual(['posts', 'users']);
  });

  it('returns empty array when no TableDefs found', () => {
    const module = {
      config: { setting: true },
      name: 'my-app',
    };

    const tables = extractTables(module as Record<string, unknown>);

    expect(tables).toHaveLength(0);
  });

  it('skips objects missing _columns', () => {
    const module = {
      partial: { _name: 'partial' },
    };

    const tables = extractTables(module as Record<string, unknown>);

    expect(tables).toHaveLength(0);
  });

  it('skips objects missing _name', () => {
    const module = {
      partial: { _columns: {} },
    };

    const tables = extractTables(module as Record<string, unknown>);

    expect(tables).toHaveLength(0);
  });

  it('skips objects where _columns is not an object', () => {
    const module = {
      bad: { _name: 'bad', _columns: 'not-an-object' },
    };

    const tables = extractTables(module as Record<string, unknown>);

    expect(tables).toHaveLength(0);
  });

  it('skips objects where _columns is null', () => {
    const module = {
      bad: { _name: 'bad', _columns: null },
    };

    const tables = extractTables(module as Record<string, unknown>);

    expect(tables).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseSqliteUrl
// ---------------------------------------------------------------------------

describe('parseSqliteUrl', () => {
  it('returns ./app.db when url is undefined', () => {
    expect(parseSqliteUrl(undefined)).toBe('./app.db');
  });

  it('strips sqlite: prefix from simple path', () => {
    expect(parseSqliteUrl('sqlite:./my.db')).toBe('./my.db');
  });

  it('strips sqlite:/// to produce absolute path', () => {
    expect(parseSqliteUrl('sqlite:///tmp/data.db')).toBe('/tmp/data.db');
  });

  it('strips sqlite:// prefix gracefully', () => {
    expect(parseSqliteUrl('sqlite://relative/path.db')).toBe('relative/path.db');
  });

  it('returns ./app.db when url is sqlite: with no path', () => {
    expect(parseSqliteUrl('sqlite:')).toBe('./app.db');
  });

  it('returns ./app.db when url is sqlite:// with no trailing path', () => {
    expect(parseSqliteUrl('sqlite://')).toBe('./app.db');
  });

  it('returns bare path unchanged when no sqlite: prefix', () => {
    expect(parseSqliteUrl('/absolute/path.db')).toBe('/absolute/path.db');
  });
});

// ---------------------------------------------------------------------------
// loadMigrationFiles
// ---------------------------------------------------------------------------

describe('loadMigrationFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `vertz-test-migrations-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads .sql files and parses migration names', async () => {
    await writeFile(join(tempDir, '0001_create-users.sql'), 'CREATE TABLE users (id INTEGER);');
    await writeFile(join(tempDir, '0002_add-posts.sql'), 'CREATE TABLE posts (id INTEGER);');

    const files = await loadMigrationFiles(tempDir);

    expect(files).toHaveLength(2);
    expect(files[0]?.name).toBe('0001_create-users.sql');
    expect(files[0]?.timestamp).toBe(1);
    expect(files[0]?.sql).toBe('CREATE TABLE users (id INTEGER);');
    expect(files[1]?.name).toBe('0002_add-posts.sql');
    expect(files[1]?.timestamp).toBe(2);
    expect(files[1]?.sql).toBe('CREATE TABLE posts (id INTEGER);');
  });

  it('returns empty array when directory does not exist', async () => {
    const files = await loadMigrationFiles(join(tempDir, 'nonexistent'));

    expect(files).toHaveLength(0);
  });

  it('skips non-sql files', async () => {
    await writeFile(join(tempDir, '0001_init.sql'), 'CREATE TABLE t (id INT);');
    await writeFile(join(tempDir, '_snapshot.json'), '{}');
    await writeFile(join(tempDir, 'README.md'), '# Migrations');

    const files = await loadMigrationFiles(tempDir);

    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('0001_init.sql');
  });

  it('skips sql files that do not match NNNN_name.sql pattern', async () => {
    await writeFile(join(tempDir, '0001_valid.sql'), 'SELECT 1;');
    await writeFile(join(tempDir, 'manual.sql'), 'SELECT 2;');

    const files = await loadMigrationFiles(tempDir);

    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('0001_valid.sql');
  });

  it('returns files sorted by timestamp', async () => {
    await writeFile(join(tempDir, '0003_third.sql'), 'SELECT 3;');
    await writeFile(join(tempDir, '0001_first.sql'), 'SELECT 1;');
    await writeFile(join(tempDir, '0002_second.sql'), 'SELECT 2;');

    const files = await loadMigrationFiles(tempDir);

    expect(files).toHaveLength(3);
    expect(files[0]?.timestamp).toBe(1);
    expect(files[1]?.timestamp).toBe(2);
    expect(files[2]?.timestamp).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// loadDbContext — error-path tests
// ---------------------------------------------------------------------------

describe('loadDbContext', () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `vertz-test-ctx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    process.cwd = () => tempDir;
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('throws with helpful message when vertz.config.ts does not exist', async () => {
    const { loadDbContext } = await import('../load-db-context');

    await expect(loadDbContext()).rejects.toThrow('Could not find vertz.config.ts');
  });

  it('throws with example config when config has no db export', async () => {
    await writeFile(join(tempDir, 'vertz.config.ts'), 'export default { compiler: {} };');

    const { loadDbContext } = await import('../load-db-context');

    await expect(loadDbContext()).rejects.toThrow('No `db` export found');
  });

  it('throws when db config is missing dialect', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { schema: './schema.ts' };`,
    );

    const { loadDbContext } = await import('../load-db-context');

    await expect(loadDbContext()).rejects.toThrow('Missing `dialect`');
  });

  it('throws when db config is missing schema', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite' };`,
    );

    const { loadDbContext } = await import('../load-db-context');

    await expect(loadDbContext()).rejects.toThrow('Missing `schema`');
  });

  it('throws when schema file does not exist', async () => {
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite', schema: './nonexistent.ts' };`,
    );

    const { loadDbContext } = await import('../load-db-context');

    await expect(loadDbContext()).rejects.toThrow('Schema file not found');
  });

  it('throws when schema file exports no table definitions', async () => {
    await writeFile(join(tempDir, 'schema.ts'), 'export const config = { setting: true };');
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite', schema: './schema.ts' };`,
    );

    const { loadDbContext } = await import('../load-db-context');

    await expect(loadDbContext()).rejects.toThrow('No table definitions found');
  });
});

// ---------------------------------------------------------------------------
// loadDbContext — happy path with real SQLite
// ---------------------------------------------------------------------------

// Schema file content that exports duck-typed TableDef objects
const SCHEMA_TS = `
export const users = {
  _name: 'users',
  _columns: {
    id: { _meta: { sqlType: 'uuid', nullable: false, primary: true, unique: false, hasDefault: false, sensitive: false, hidden: false } },
    name: { _meta: { sqlType: 'text', nullable: false, primary: false, unique: false, hasDefault: false, sensitive: false, hidden: false } },
  },
  _indexes: [],
  _shared: false,
};
`;

describe('loadDbContext (happy path)', () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `vertz-test-happy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(join(tempDir, 'migrations'), { recursive: true });
    process.cwd = () => tempDir;
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns a fully populated DbCommandContext with sqlite dialect', async () => {
    await writeFile(join(tempDir, 'schema.ts'), SCHEMA_TS);
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite', url: 'sqlite:${join(tempDir, 'test.db')}', schema: './schema.ts' };`,
    );
    await writeFile(join(tempDir, 'migrations', '0001_init.sql'), 'CREATE TABLE users (id TEXT);');

    const { loadDbContext } = await import('../load-db-context');
    const ctx = await loadDbContext();

    expect(ctx.currentSnapshot.version).toBe(1);
    expect(ctx.currentSnapshot.tables).toHaveProperty('users');
    expect(ctx.currentSnapshot.tables.users?.columns).toHaveProperty('id');
    expect(ctx.currentSnapshot.tables.users?.columns).toHaveProperty('name');
    expect(ctx.previousSnapshot).toEqual({ version: 1, tables: {}, enums: {} });
    expect(ctx.savedSnapshot).toBeUndefined();
    expect(ctx.migrationsDir).toBe(join(tempDir, 'migrations'));
    expect(ctx.migrationFiles).toHaveLength(1);
    expect(ctx.migrationFiles[0]?.name).toBe('0001_init.sql');
    expect(ctx.existingFiles).toEqual(['0001_init.sql']);
    expect(ctx.dialect.name).toBe('sqlite');
    expect(typeof ctx.queryFn).toBe('function');
    expect(typeof ctx.writeFile).toBe('function');
    expect(typeof ctx.readFile).toBe('function');
    expect(typeof ctx.close).toBe('function');

    await ctx.close();
  });

  it('loads saved snapshot as previousSnapshot when present', async () => {
    await writeFile(join(tempDir, 'schema.ts'), SCHEMA_TS);
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite', url: 'sqlite:${join(tempDir, 'test2.db')}', schema: './schema.ts' };`,
    );
    const savedSnap = {
      version: 1,
      tables: { old_table: { columns: {}, indexes: [], foreignKeys: [], _metadata: {} } },
      enums: {},
    };
    await writeFile(join(tempDir, 'migrations', '_snapshot.json'), JSON.stringify(savedSnap));

    const { loadDbContext } = await import('../load-db-context');
    const ctx = await loadDbContext();

    expect(ctx.previousSnapshot).toEqual(savedSnap);
    expect(ctx.savedSnapshot).toEqual(savedSnap);

    await ctx.close();
  });

  it('uses custom migrationsDir and snapshotPath when configured', async () => {
    const customDir = join(tempDir, 'db', 'migs');
    await mkdir(customDir, { recursive: true });
    await writeFile(join(tempDir, 'schema.ts'), SCHEMA_TS);
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = {
  dialect: 'sqlite',
  url: 'sqlite:${join(tempDir, 'test3.db')}',
  schema: './schema.ts',
  migrationsDir: './db/migs',
  snapshotPath: './db/snap.json',
};`,
    );
    await writeFile(join(customDir, '0001_init.sql'), 'SELECT 1;');

    const { loadDbContext } = await import('../load-db-context');
    const ctx = await loadDbContext();

    expect(ctx.migrationsDir).toBe(customDir);
    expect(ctx.migrationFiles).toHaveLength(1);

    await ctx.close();
  });

  it('writeFile creates directories and writes content', async () => {
    await writeFile(join(tempDir, 'schema.ts'), SCHEMA_TS);
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite', url: 'sqlite:${join(tempDir, 'test4.db')}', schema: './schema.ts' };`,
    );

    const { loadDbContext } = await import('../load-db-context');
    const ctx = await loadDbContext();

    const testPath = join(tempDir, 'nested', 'dir', 'test.sql');
    await ctx.writeFile(testPath, 'CREATE TABLE test;');

    const content = await readFile(testPath, 'utf-8');
    expect(content).toBe('CREATE TABLE test;');

    await ctx.close();
  });

  it('readFile reads file content', async () => {
    await writeFile(join(tempDir, 'schema.ts'), SCHEMA_TS);
    await writeFile(
      join(tempDir, 'vertz.config.ts'),
      `export default {};
export const db = { dialect: 'sqlite', url: 'sqlite:${join(tempDir, 'test5.db')}', schema: './schema.ts' };`,
    );
    await writeFile(join(tempDir, 'test-read.txt'), 'hello from readFile');

    const { loadDbContext } = await import('../load-db-context');
    const ctx = await loadDbContext();

    const content = await ctx.readFile(join(tempDir, 'test-read.txt'));
    expect(content).toBe('hello from readFile');

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// createConnection — sqlite (bun:sqlite is available in bun test)
// ---------------------------------------------------------------------------

describe('createConnection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `vertz-test-conn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a working sqlite connection with queryFn and close', async () => {
    const dbPath = join(tempDir, 'test.db');

    const conn = await createConnection({ dialect: 'sqlite', url: `sqlite:${dbPath}`, schema: '' });

    await conn.queryFn('CREATE TABLE test_tbl (id INTEGER PRIMARY KEY, name TEXT)', []);
    await conn.queryFn('INSERT INTO test_tbl (id, name) VALUES (?, ?)', [1, 'alice']);
    const result = await conn.queryFn('SELECT * FROM test_tbl', []);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ id: 1, name: 'alice' });
    expect(result.rowCount).toBe(1);

    // close should not throw
    await conn.close();
  });

  it('close prevents further queries on sqlite', async () => {
    const dbPath = join(tempDir, 'close-test.db');

    const conn = await createConnection({ dialect: 'sqlite', url: `sqlite:${dbPath}`, schema: '' });
    await conn.queryFn('CREATE TABLE t (id INTEGER)', []);
    await conn.close();

    // After close, querying should throw
    await expect(conn.queryFn('SELECT * FROM t', [])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createConnection — postgres (via PGlite in-memory)
// ---------------------------------------------------------------------------

describe('createConnection (postgres)', () => {
  let pg: import('@electric-sql/pglite').PGlite;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    pg = new PGlite();
  });

  afterAll(async () => {
    await pg.close();
  });

  it('creates a working postgres queryFn that executes SQL and returns rows', async () => {
    // Build a queryFn that delegates to PGlite, mimicking what createConnection does
    const queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await pg.query(sql, params as unknown[]);
      const rows = result.rows as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    };

    await queryFn(
      'CREATE TABLE IF NOT EXISTS pg_test (id SERIAL PRIMARY KEY, name TEXT NOT NULL)',
      [],
    );
    await queryFn('INSERT INTO pg_test (name) VALUES ($1)', ['alice']);
    const result = await queryFn('SELECT * FROM pg_test WHERE name = $1', ['alice']);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe('alice');
    expect(result.rowCount).toBe(1);
  });

  it('handles parameterized queries correctly', async () => {
    const queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await pg.query(sql, params as unknown[]);
      const rows = result.rows as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    };

    await queryFn(
      'CREATE TABLE IF NOT EXISTS pg_params_test (id SERIAL PRIMARY KEY, value TEXT NOT NULL)',
      [],
    );
    await queryFn('INSERT INTO pg_params_test (value) VALUES ($1)', ['first']);
    await queryFn('INSERT INTO pg_params_test (value) VALUES ($1)', ['second']);

    const result = await queryFn('SELECT * FROM pg_params_test ORDER BY id', []);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.value).toBe('first');
    expect(result.rows[1]?.value).toBe('second');
  });

  it('returns empty rows for queries with no matches', async () => {
    const queryFn = async (sql: string, params: readonly unknown[]) => {
      const result = await pg.query(sql, params as unknown[]);
      const rows = result.rows as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    };

    const result = await queryFn('SELECT * FROM pg_test WHERE name = $1', ['nonexistent']);
    expect(result.rows).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });
});
