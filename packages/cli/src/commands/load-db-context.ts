import {
  access,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  mkdir,
  readdir,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Dialect, MigrationFile, MigrationQueryFn, SchemaSnapshot, TableDef } from '@vertz/db';
import {
  createSnapshot,
  defaultPostgresDialect,
  defaultSqliteDialect,
  NodeSnapshotStorage,
  parseMigrationName,
} from '@vertz/db';
import { createJiti } from 'jiti';
import type { DbCommandContext } from './db';

export interface DbConfig {
  dialect: 'sqlite' | 'postgres';
  url?: string;
  schema: string;
  migrationsDir?: string;
  snapshotPath?: string;
}

/** Adapter contract for bun:sqlite Database (runtime-only module). */
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

export async function loadDbContext(): Promise<DbCommandContext> {
  const configPath = resolve(process.cwd(), 'vertz.config.ts');

  // Load vertz.config.ts — catch missing file separately for a clear message
  let configModule: Record<string, unknown>;
  try {
    const jiti = createJiti(import.meta.url, { interopDefault: true });
    configModule = (await jiti.import(configPath)) as Record<string, unknown>;
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
    const jiti = createJiti(import.meta.url, { interopDefault: true });
    schemaModule = (await jiti.import(schemaPath)) as Record<string, unknown>;
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

  const tables = extractTables(schemaModule);
  if (tables.length === 0) {
    throw new Error(
      `No table definitions found in ${schemaPath}. Export your tables as named exports:\n\n` +
        `  export const users = d.table('users', { ... });\n`,
    );
  }

  const currentSnapshot = createSnapshot(tables);

  const storage = new NodeSnapshotStorage();
  const savedSnapshot = await storage.load(snapshotPath);
  const previousSnapshot: SchemaSnapshot = savedSnapshot ?? { version: 1, tables: {}, enums: {} };

  const dialect: Dialect =
    dbConfig.dialect === 'sqlite' ? defaultSqliteDialect : defaultPostgresDialect;
  const connection = await createConnection(dbConfig);

  const migrationFiles = await loadMigrationFiles(migrationsDir);
  const existingFiles = migrationFiles.map((f) => f.name);

  const writeFile = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, content, 'utf-8');
  };

  const readFile = async (path: string) => {
    return fsReadFile(path, 'utf-8');
  };

  return {
    queryFn: connection.queryFn,
    currentSnapshot,
    previousSnapshot,
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

export function extractTables(module: Record<string, unknown>): TableDef[] {
  return Object.values(module).filter(
    (v): v is TableDef =>
      v !== null &&
      typeof v === 'object' &&
      '_name' in v &&
      '_columns' in v &&
      typeof (v as Record<string, unknown>)._columns === 'object' &&
      (v as Record<string, unknown>)._columns !== null,
  );
}

/** Parse a sqlite: URL into a file path. Handles sqlite:path, sqlite:///path, and bare paths. */
export function parseSqliteUrl(url: string | undefined): string {
  if (!url) return './app.db';
  if (!url.startsWith('sqlite:')) return url;
  const stripped = url.slice('sqlite:'.length);
  // sqlite:///absolute/path -> /absolute/path
  if (stripped.startsWith('///')) return stripped.slice(2);
  // sqlite://relative is ambiguous but handle gracefully
  if (stripped.startsWith('//')) return stripped.slice(2);
  return stripped || './app.db';
}

export async function createConnection(config: DbConfig): Promise<DbConnection> {
  if (config.dialect === 'sqlite') {
    const dbPath = parseSqliteUrl(config.url);
    let db: SqliteDatabase;
    try {
      // @ts-expect-error — bun:sqlite is a runtime-only module (available when running under Bun)
      const { Database } = await import('bun:sqlite');
      db = new Database(dbPath) as SqliteDatabase;
    } catch {
      throw new Error(
        'Failed to load bun:sqlite. The vertz CLI requires the Bun runtime for SQLite support.\n' +
          'Run your command with: bun vertz db <command>',
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

  // Postgres
  let client: PostgresClient;
  try {
    const pg = (await import('postgres')).default;
    client = pg(config.url ?? '') as PostgresClient;
  } catch {
    throw new Error('Failed to load the `postgres` package. Install it with:\n  bun add postgres');
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

  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];

  for (const filename of sqlFiles) {
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
