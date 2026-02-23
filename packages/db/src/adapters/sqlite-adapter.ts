/**
 * SQLite Database Adapter for @vertz/db
 *
 * Generic adapter that takes a schema and generates SQL — no manual SQL needed.
 * Implements EntityDbAdapter interface for use with @vertz/server.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DbDriver } from '../client/driver';
import type { TableDef, ColumnRecord } from '../schema/table';
import type { EntityDbAdapter } from '../types/adapter';
import { generateCreateTableSql, generateIndexSql, BaseSqlAdapter } from './sql-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SqliteAdapterOptions<T extends ColumnRecord> {
  /** The table schema definition */
  schema: TableDef<T>;
  /** Path to the SQLite database file */
  dbPath?: string;
  /** Directory to store the database file (alternative to dbPath) */
  dataDir?: string;
  /** Auto-apply migrations on startup */
  migrations?: {
    autoApply?: boolean;
  };
}

export interface SqliteAdapterConfig {
  /** Path to the SQLite database file */
  dbPath?: string;
  /** Directory to store the database file */
  dataDir?: string;
  /** Auto-apply migrations on startup */
  migrations?: {
    autoApply?: boolean;
  };
}

// ---------------------------------------------------------------------------
// SQLite Driver Implementation
// ---------------------------------------------------------------------------

/**
 * Minimal SQLite database interface (matches bun:sqlite AND better-sqlite3 API surface)
 */
interface SqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number };
  };
  exec(sql: string): void;
  run(sql: string): void;
  close(): void;
}

/**
 * Create a SQLite driver using bun:sqlite or better-sqlite3.
 */
export function createSqliteDriver(dbPath: string): DbDriver {
  let db: SqliteDatabase;

  try {
    // Try bun:sqlite first (for Bun runtime)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite');
    db = new Database(dbPath) as SqliteDatabase;
  } catch {
    // Fall back to better-sqlite3 (for Node.js runtime)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3');
      db = new Database(dbPath) as SqliteDatabase;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to create SQLite database at "${dbPath}". ` +
        `Please ensure the directory exists and you have write permissions. ` +
        `Error: ${errorMessage}`
      );
    }
  }

  // Enable WAL mode for better performance
  db.exec('PRAGMA journal_mode = WAL');

  return {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();
      return rows as T[];
    },

    async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { rowsAffected: result.changes };
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// SQLite EntityDbAdapter Implementation
// ---------------------------------------------------------------------------

/**
 * SQLite EntityDbAdapter that generates SQL from schema.
 */
export class SqliteAdapter<T extends ColumnRecord> extends BaseSqlAdapter<T> {
  constructor(driver: DbDriver, schema: TableDef<T>) {
    super(driver, schema);
  }
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a SQLite EntityDbAdapter from a schema.
 */
export async function createSqliteAdapter<T extends ColumnRecord>(
  options: SqliteAdapterOptions<T>
): Promise<EntityDbAdapter> {
  const { schema, dbPath, dataDir, migrations } = options;

  // Determine database path
  let resolvedDbPath: string;
  if (dbPath) {
    resolvedDbPath = dbPath;
  } else {
    const dir = dataDir || path.join(__dirname, '..', '..', '..', 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    resolvedDbPath = path.join(dir, `${schema._name}.db`);
  }

  // Create driver
  const driver = createSqliteDriver(resolvedDbPath);

  // Run migrations if enabled (FIX: now properly awaited)
  if (migrations?.autoApply) {
    const createTableSql = generateCreateTableSql(schema);
    await driver.execute(createTableSql);

    const indexSqls = generateIndexSql(schema);
    for (const sql of indexSqls) {
      await driver.execute(sql);
    }

    console.log(`📦 SQLite database initialized at: ${resolvedDbPath}`);
  }

  return new SqliteAdapter(driver, schema);
}
