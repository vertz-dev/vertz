import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, readdir } from 'node:fs/promises';
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

export async function loadDbContext(): Promise<DbCommandContext> {
  const configPath = resolve(process.cwd(), 'vertz.config.ts');
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const configModule = (await jiti.import(configPath)) as Record<string, unknown>;
  const dbConfig = configModule.db as DbConfig | undefined;

  if (!dbConfig) {
    throw new Error('No `db` export found in vertz.config.ts');
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

  const schemaPath = resolve(cwd, dbConfig.schema);
  const schemaModule = (await jiti.import(schemaPath)) as Record<string, unknown>;
  const tables = extractTables(schemaModule);
  const currentSnapshot = createSnapshot(tables);

  const storage = new NodeSnapshotStorage();
  const savedSnapshot = await storage.load(snapshotPath);
  const previousSnapshot: SchemaSnapshot = savedSnapshot ?? { version: 1, tables: {}, enums: {} };

  const dialect: Dialect =
    dbConfig.dialect === 'sqlite' ? defaultSqliteDialect : defaultPostgresDialect;
  const queryFn = await createQueryFn(dbConfig);

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
    queryFn,
    currentSnapshot,
    previousSnapshot,
    savedSnapshot: savedSnapshot ?? undefined,
    migrationFiles,
    migrationsDir,
    existingFiles,
    dialect,
    writeFile,
    readFile,
  };
}

export function extractTables(module: Record<string, unknown>): TableDef[] {
  return Object.values(module).filter(
    (v): v is TableDef => v !== null && typeof v === 'object' && '_name' in v && '_columns' in v,
  );
}

export async function createQueryFn(config: DbConfig): Promise<MigrationQueryFn> {
  if (config.dialect === 'sqlite') {
    const dbPath = config.url?.replace(/^sqlite:/, '') ?? './app.db';
    // @ts-expect-error — bun:sqlite is a runtime-only module (available when running under Bun)
    const { Database } = await import('bun:sqlite');
    const db = new Database(dbPath);
    return async (sql: string, params: readonly unknown[]) => {
      const stmt = (
        db as { prepare: (s: string) => { all: (...p: unknown[]) => unknown[] } }
      ).prepare(sql);
      const rows = stmt.all(...(params as unknown[])) as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    };
  }

  // @ts-expect-error — postgres types are not in CLI's devDependencies (runtime peer dep)
  const pg = (await import('postgres')).default;
  const sql = pg(config.url ?? '');
  return async (query: string, params: readonly unknown[]) => {
    const result = await (
      sql as { unsafe: (q: string, p: unknown[]) => Promise<unknown[]> }
    ).unsafe(query, params as unknown[]);
    const rows = Array.from(result) as Record<string, unknown>[];
    return { rows, rowCount: rows.length };
  };
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
