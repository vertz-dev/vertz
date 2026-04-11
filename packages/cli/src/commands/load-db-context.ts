import {
  access,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  mkdir,
  readdir,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type {
  Dialect,
  MigrationFile,
  MigrationQueryFn,
  ModelDef,
  SchemaSnapshot,
  TableDef,
} from '@vertz/db';
import {
  createSnapshot,
  defaultPostgresDialect,
  defaultSqliteDialect,
  parseMigrationName,
} from '@vertz/db';
import { NodeSnapshotStorage } from '@vertz/db/internals';
import { createJiti } from 'jiti';
import type { DbCommandContext } from './db';

/** @internal — exported for test spying (avoids global vi.mock on 'jiti') */
export function _importConfig(configPath: string): Promise<Record<string, unknown>> {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  return jiti.import(configPath) as Promise<Record<string, unknown>>;
}

export interface DbConfig {
  dialect: 'sqlite' | 'postgres';
  url?: string;
  schema: string;
  migrationsDir?: string;
  snapshotPath?: string;
}

const DEFAULT_SQLITE_PATH = './app.db';

/** Adapter contract for @vertz/sqlite Database (runtime-only module). */
interface SqliteDatabase {
  prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] };
  close: () => void;
}

/** Adapter contract for the `postgres` package (runtime peer dependency). */
interface PostgresClient {
  unsafe: (query: string, params: unknown[]) => Promise<unknown[]>;
  end: () => Promise<void>;
}

export interface DbConnection {
  queryFn: MigrationQueryFn;
  close: () => Promise<void>;
}

export interface IntrospectContext {
  queryFn: MigrationQueryFn;
  dialect: Dialect;
  dialectName: 'sqlite' | 'postgres';
  close: () => Promise<void>;
}

export async function loadDbContext(): Promise<DbCommandContext> {
  const configPath = resolve(process.cwd(), 'vertz.config.ts');

  // Load vertz.config.ts — catch missing file separately for a clear message
  let configModule: Record<string, unknown>;
  try {
    configModule = await _importConfig(configPath);
  } catch {
    try {
      await access(configPath);
    } catch {
      throw new Error(
        `Could not find vertz.config.ts in ${process.cwd()}. Create it with a db export:\n\n` +
          `  export const db = {\n` +
          `    dialect: 'sqlite',\n` +
          `    schema: './src/schema.ts',\n` +
          `  };\n`,
      );
    }
    throw new Error(
      `Failed to load vertz.config.ts: the file exists but could not be parsed. Check for syntax errors.`,
    );
  }

  const dbConfig = configModule.db as DbConfig | undefined;

  if (!dbConfig) {
    throw new Error(
      `No \`db\` export found in ${configPath}. Add a named export:\n\n` +
        `  export const db = {\n` +
        `    dialect: 'sqlite',\n` +
        `    schema: './src/schema.ts',\n` +
        `  };\n`,
    );
  }

  if (!dbConfig.dialect) {
    throw new Error('Missing `dialect` in db config (expected "sqlite" or "postgres")');
  }

  if (!dbConfig.schema) {
    throw new Error('Missing `schema` in db config (path to schema file)');
  }

  const cwd = process.cwd();
  const migrationsDir = resolve(cwd, dbConfig.migrationsDir ?? './migrations');
  const snapshotPath = dbConfig.snapshotPath
    ? resolve(cwd, dbConfig.snapshotPath)
    : join(migrationsDir, '_snapshot.json');

  // Load schema file — catch missing/broken file separately
  const schemaPath = resolve(cwd, dbConfig.schema);
  let schemaModule: Record<string, unknown>;
  try {
    schemaModule = await _importConfig(schemaPath);
  } catch {
    try {
      await access(schemaPath);
    } catch {
      throw new Error(
        `Schema file not found: ${schemaPath}. Check the \`schema\` path in your db config.`,
      );
    }
    throw new Error(`Failed to load schema file at ${schemaPath}. Check for syntax errors.`);
  }

  const entries = extractSchemaEntries(schemaModule);
  if (entries.length === 0) {
    throw new Error(
      `No table definitions found in ${schemaPath}. Export your tables as named exports:\n\n` +
        `  export const users = d.table('users', { ... });\n`,
    );
  }

  const currentSnapshot = createSnapshot(entries);

  const storage = new NodeSnapshotStorage();
  const savedSnapshot = await storage.load(snapshotPath);
  const previousSnapshot: SchemaSnapshot = savedSnapshot ?? { version: 1, tables: {}, enums: {} };

  const dialect: Dialect =
    dbConfig.dialect === 'sqlite' ? defaultSqliteDialect : defaultPostgresDialect;
  // TODO: consider lazy connection — dry-run modes don't need a DB connection
  const connection = await createConnection(dbConfig);

  const migrationFiles = await loadMigrationFiles(migrationsDir);
  const existingFiles = migrationFiles.map((f) => f.name);

  const writeFile = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, content, 'utf-8');
  };

  const readFile = (path: string) => fsReadFile(path, 'utf-8');

  return {
    queryFn: connection.queryFn,
    currentSnapshot,
    previousSnapshot,
    // Normalize null → undefined for stricter downstream typing
    savedSnapshot: savedSnapshot ?? undefined,
    migrationFiles,
    migrationsDir,
    existingFiles,
    dialect,
    writeFile,
    readFile,
    close: connection.close,
  };
}

/** Check if a module export looks like a TableDef (duck-typing on _name + _columns). */
function isTableDef(v: unknown): v is TableDef {
  return (
    v !== null &&
    typeof v === 'object' &&
    '_name' in v &&
    '_columns' in v &&
    typeof (v as Record<string, unknown>)._columns === 'object' &&
    (v as Record<string, unknown>)._columns !== null
  );
}

/** Check if a module export looks like a ModelDef (duck-typing on table + relations). */
function isModelDef(v: unknown): v is ModelDef {
  return (
    v !== null &&
    typeof v === 'object' &&
    'table' in v &&
    'relations' in v &&
    isTableDef((v as Record<string, unknown>).table)
  );
}

/**
 * Extract schema entries (ModelDef or TableDef) from a module's exports.
 * When both a bare TableDef and a ModelDef wrapping it are exported,
 * the ModelDef wins (deduplication by table name).
 */
export function extractSchemaEntries(module: Record<string, unknown>): (TableDef | ModelDef)[] {
  const models: ModelDef[] = [];
  const tables: TableDef[] = [];

  for (const value of Object.values(module)) {
    if (isModelDef(value)) {
      models.push(value);
    } else if (isTableDef(value)) {
      tables.push(value);
    }
  }

  // Deduplicate: if a ModelDef wraps a TableDef that's also exported, prefer the ModelDef
  const modelTableNames = new Set(models.map((m) => m.table._name));
  const dedupedTables = tables.filter((t) => !modelTableNames.has(t._name));

  return [...models, ...dedupedTables];
}

/** Parse a sqlite: URL into a file path. Handles sqlite:path, sqlite:///path, and bare paths. */
export function parseSqliteUrl(url: string | undefined): string {
  if (!url) return DEFAULT_SQLITE_PATH;
  if (!url.startsWith('sqlite:')) return url;
  const stripped = url.slice('sqlite:'.length);
  // sqlite:///absolute/path -> /absolute/path
  if (stripped.startsWith('///')) return stripped.slice(2);
  // sqlite://relative is ambiguous but handle gracefully
  if (stripped.startsWith('//')) return stripped.slice(2) || DEFAULT_SQLITE_PATH;
  return stripped || DEFAULT_SQLITE_PATH;
}

export async function createConnection(config: DbConfig): Promise<DbConnection> {
  if (config.dialect === 'sqlite') {
    const dbPath = parseSqliteUrl(config.url);
    let db: SqliteDatabase;
    try {
      const { Database } = await import('@vertz/sqlite');
      db = new Database(dbPath) as SqliteDatabase;
    } catch (err) {
      throw new Error(
        'Failed to load @vertz/sqlite. The vertz CLI requires the vtz runtime for SQLite support.\n' +
          'Run your command with: vtz vertz db <command>',
        { cause: err },
      );
    }
    const queryFn: MigrationQueryFn = async (sql: string, params: readonly unknown[]) => {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...(params as unknown[])) as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    };
    const close = async () => {
      db.close();
    };
    return { queryFn, close };
  }

  // Postgres — dynamic import because `postgres` is an optional peer dependency.
  // The type assertion avoids TS2307 when the package is not installed.
  let client: PostgresClient;
  try {
    const pg = (
      (await import(/* webpackIgnore: true */ 'postgres' as string)) as {
        default: (url: string) => PostgresClient;
      }
    ).default;
    client = pg(config.url ?? '');
  } catch (err) {
    throw new Error(
      'Failed to load the `postgres` package. Install it in your project:\n' +
        '  npm install postgres    # or: bun add postgres',
      { cause: err },
    );
  }
  const queryFn: MigrationQueryFn = async (query: string, params: readonly unknown[]) => {
    const result = await client.unsafe(query, params as unknown[]);
    const rows = Array.from(result) as Record<string, unknown>[];
    return { rows, rowCount: rows.length };
  };
  const close = async () => {
    await client.end();
  };
  return { queryFn, close };
}

export async function loadMigrationFiles(dir: string): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files: MigrationFile[] = [];

  for (const filename of entries.filter((f) => f.endsWith('.sql'))) {
    const parsed = parseMigrationName(filename);
    if (!parsed) continue;

    const content = await fsReadFile(join(dir, filename), 'utf-8');
    files.push({
      name: parsed.name,
      sql: content,
      timestamp: parsed.timestamp,
    });
  }

  return files.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Lightweight context for autoMigrate() — avoids loading migration files,
 * previous snapshots, or creating storage. Schema is loaded with cache-busting
 * so changes are always picked up on repeat calls.
 */
export interface AutoMigrateContext {
  currentSchema: SchemaSnapshot;
  snapshotPath: string;
  dialect: 'sqlite';
  db: MigrationQueryFn;
  close: () => Promise<void>;
}

export async function loadAutoMigrateContext(): Promise<AutoMigrateContext> {
  const configPath = resolve(process.cwd(), 'vertz.config.ts');

  let configModule: Record<string, unknown>;
  try {
    configModule = await _importConfig(configPath);
  } catch {
    try {
      await access(configPath);
    } catch {
      throw new Error(`Could not find vertz.config.ts in ${process.cwd()}.`);
    }
    throw new Error('Failed to load vertz.config.ts.');
  }

  const dbConfig = configModule.db as DbConfig | undefined;
  if (!dbConfig || !dbConfig.dialect || !dbConfig.schema) {
    throw new Error('No valid `db` config found in vertz.config.ts.');
  }

  if (dbConfig.dialect !== 'sqlite') {
    throw new Error('Auto-migrate in dev currently only supports sqlite.');
  }

  const cwd = process.cwd();
  const migrationsDir = resolve(cwd, dbConfig.migrationsDir ?? './migrations');
  const snapshotPath = dbConfig.snapshotPath
    ? resolve(cwd, dbConfig.snapshotPath)
    : join(migrationsDir, '_snapshot.json');

  // Load schema with cache-busting to pick up changes on repeat calls
  const schemaPath = resolve(cwd, dbConfig.schema);
  try {
    await access(schemaPath);
  } catch {
    throw new Error(`Schema file not found: ${schemaPath}.`);
  }

  const schemaModule = (await import(`${schemaPath}?t=${Date.now()}`)) as Record<string, unknown>;
  const entries = extractSchemaEntries(schemaModule);
  if (entries.length === 0) {
    throw new Error(`No table definitions found in ${schemaPath}.`);
  }

  const currentSchema = createSnapshot(entries);

  // Open connection only after schema loads successfully (no leak on schema errors)
  const connection = await createConnection(dbConfig);

  return {
    currentSchema,
    snapshotPath,
    dialect: 'sqlite',
    db: connection.queryFn,
    close: connection.close,
  };
}

/**
 * Lightweight context for db pull — only needs a DB connection, no schema file.
 * Supports CLI overrides for zero-config usage (--url/--dialect flags).
 */
export async function loadIntrospectContext(overrides?: {
  url?: string;
  dialect?: 'sqlite' | 'postgres';
}): Promise<IntrospectContext> {
  let dialectName: 'sqlite' | 'postgres';
  let url: string | undefined;

  if (overrides?.dialect && overrides?.url) {
    // Zero-config mode: use CLI flags directly
    dialectName = overrides.dialect;
    url = overrides.url;
  } else {
    // Config mode: load from vertz.config.ts
    const configPath = resolve(process.cwd(), 'vertz.config.ts');

    let configModule: Record<string, unknown>;
    try {
      configModule = await _importConfig(configPath);
    } catch {
      try {
        await access(configPath);
      } catch {
        throw new Error(
          'Could not find vertz.config.ts. Either create it or use --url and --dialect flags.',
        );
      }
      throw new Error('Failed to load vertz.config.ts: check for syntax errors.');
    }

    const dbConfig = configModule.db as DbConfig | undefined;
    if (!dbConfig?.dialect) {
      throw new Error(
        'No `dialect` found in vertz.config.ts db config. Use --dialect flag instead.',
      );
    }

    dialectName = overrides?.dialect ?? dbConfig.dialect;
    url = overrides?.url ?? dbConfig.url;
  }

  const dialect: Dialect = dialectName === 'sqlite' ? defaultSqliteDialect : defaultPostgresDialect;

  const connection = await createConnection({ dialect: dialectName, url, schema: '' });

  return {
    queryFn: connection.queryFn,
    dialect,
    dialectName,
    close: connection.close,
  };
}
