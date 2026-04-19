/**
 * SQLite driver adapter — wraps Cloudflare D1 for use with createDb.
 *
 * Provides a DbDriver interface that wraps D1's prepare/bind/all/run API.
 */

import { JsonbParseError, JsonbValidationError } from '../errors';
import type { JsonbValidator } from '../schema/column';
import type { DbDriver } from './driver';
import { fromSqliteValue, toSqliteValue } from './sqlite-value-converter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * D1 database binding interface.
 */
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

/**
 * D1 prepared statement interface.
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

/**
 * Per-column schema information consumed by the row-mapper on reads.
 *
 * The row-mapper accepts either a bare SQL type string (e.g. `'jsonb'`) or an
 * object carrying additional metadata like the optional `validator`. The string
 * form is a shortcut for `{ sqlType }` with no validator.
 */
export interface ColumnSchemaEntry {
  readonly sqlType: string;
  readonly validator?: JsonbValidator<unknown>;
}

/**
 * Table schema registry mapping table names to their column definitions.
 * Maps tableName → { columnName → columnType | ColumnSchemaEntry }.
 *
 * **Shortcut invariant:** the plain `string` form is equivalent to
 * `{ sqlType: string }` with no validator and no other metadata. If a future
 * contributor adds per-column read metadata beyond `validator`, both the
 * `ColumnSchemaEntry` interface and `buildTableSchema` must be updated so
 * the shortcut remains a no-metadata-lost alias.
 */
export type TableSchemaRegistry = Map<string, Record<string, string | ColumnSchemaEntry>>;

// ---------------------------------------------------------------------------
// Helper: Build table schema from table entries
// ---------------------------------------------------------------------------

import type { ColumnMetadata } from '../schema/column';
import type { ModelEntry } from '../schema/inference';

/**
 * Builds a table schema registry from table entries.
 * Stores `sqlType` as a string shortcut when there's no per-column validator,
 * or a full `ColumnSchemaEntry` when a validator is attached.
 */
export function buildTableSchema<TModels extends Record<string, ModelEntry>>(
  models: TModels,
): TableSchemaRegistry {
  const registry: TableSchemaRegistry = new Map();

  for (const [, entry] of Object.entries(models)) {
    const tableName = entry.table._name;
    const columnTypes: Record<string, string | ColumnSchemaEntry> = {};

    for (const [colName, colBuilder] of Object.entries(entry.table._columns)) {
      const meta = (colBuilder as unknown as { _meta: ColumnMetadata })._meta;
      if (meta.validator !== undefined) {
        columnTypes[colName] = { sqlType: meta.sqlType, validator: meta.validator };
      } else {
        columnTypes[colName] = meta.sqlType;
      }
    }

    registry.set(tableName, columnTypes);
  }

  return registry;
}

function readSqlType(entry: string | ColumnSchemaEntry): string {
  return typeof entry === 'string' ? entry : entry.sqlType;
}

function readValidator(entry: string | ColumnSchemaEntry): JsonbValidator<unknown> | undefined {
  return typeof entry === 'string' ? undefined : entry.validator;
}

/**
 * Convert one row's values using per-column schema. Parse JSONB cells, run
 * validators when present, and enrich `JsonbParseError` / `JsonbValidationError`
 * with `table` / `column` context that `fromSqliteValue` can't know on its own.
 *
 * Known limitation: `extractTableName` at the driver level uses the first FROM
 * / INSERT INTO / UPDATE / DELETE FROM match, so for a JOIN like
 * `SELECT ... FROM a JOIN b ...` the enriched table will always be the one
 * named after the top-level verb. Accurate attribution on joins is tracked
 * as a separate follow-up and falls outside this phase's scope.
 */
function convertRowWithSchema<T>(
  row: Record<string, unknown>,
  schema: Record<string, string | ColumnSchemaEntry>,
  tableName: string,
): T {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const entry = schema[key];
    if (entry === undefined) {
      converted[key] = value;
      continue;
    }
    const sqlType = readSqlType(entry);
    let next: unknown;
    try {
      next = fromSqliteValue(value, sqlType);
    } catch (err) {
      if (err instanceof JsonbParseError) {
        throw new JsonbParseError({
          columnType: err.columnType,
          // Preserve any enrichment upstream may already have applied;
          // only fall back to this call's context when unset.
          table: err.table ?? tableName,
          column: err.column ?? key,
          cause: err.cause,
        });
      }
      throw err;
    }
    const validator = readValidator(entry);
    if (validator !== undefined && next !== null) {
      try {
        next = validator.parse(next);
      } catch (cause) {
        throw new JsonbValidationError({ table: tableName, column: key, value: next, cause });
      }
    }
    converted[key] = next;
  }
  return converted as T;
}

// ---------------------------------------------------------------------------
// Helper: Extract table name from SQL query
// ---------------------------------------------------------------------------

/**
 * Extracts the table name from a SQL query.
 * Handles SELECT, INSERT, UPDATE, DELETE statements.
 */
function extractTableName(sql: string): string | null {
  // SELECT ... FROM tablename
  const fromMatch = sql.match(/\bFROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (fromMatch) {
    return fromMatch[1]!.toLowerCase();
  }

  // INSERT INTO tablename
  const insertMatch = sql.match(/\bINSERT\s+INTO\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (insertMatch) {
    return insertMatch[1]!.toLowerCase();
  }

  // UPDATE tablename
  const updateMatch = sql.match(/\bUPDATE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (updateMatch) {
    return updateMatch[1]!.toLowerCase();
  }

  // DELETE FROM tablename
  const deleteMatch = sql.match(/\bDELETE\s+FROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (deleteMatch) {
    return deleteMatch[1]!.toLowerCase();
  }

  return null;
}

// ---------------------------------------------------------------------------
// Driver interface
// ---------------------------------------------------------------------------

export interface SqliteDriver extends DbDriver {
  /** Check connection health (runs SELECT 1). */
  isHealthy(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// createSqliteDriver — factory
// ---------------------------------------------------------------------------

/**
 * Create a SQLite driver from a D1 database binding.
 *
 * @param d1 - D1 database binding
 * @param tableSchema - Optional table schema registry for value conversion
 * @returns A SqliteDriver with query, execute, close, and isHealthy methods
 */
export function createSqliteDriver(
  d1: D1Database,
  tableSchema?: TableSchemaRegistry,
): SqliteDriver {
  const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    const prepared = d1.prepare(sql);
    const bound = params ? prepared.bind(...params) : prepared;
    const result = await bound.all();

    // Convert values using table schema if available
    if (tableSchema && result.results.length > 0) {
      const tableName = extractTableName(sql);
      if (tableName) {
        const schema = tableSchema.get(tableName);
        if (schema) {
          return result.results.map((row) =>
            convertRowWithSchema<T>(row as Record<string, unknown>, schema, tableName),
          );
        }
      }
    }

    return result.results as T[];
  };

  const execute = async (sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> => {
    const prepared = d1.prepare(sql);
    const bound = params ? prepared.bind(...params) : prepared;
    const result = await bound.run();
    return { rowsAffected: result.meta.changes };
  };

  return {
    query,
    execute,
    close: async () => {
      // D1 doesn't require explicit closing
      // This is a no-op for compatibility with DbDriver interface
    },
    isHealthy: async () => {
      try {
        await query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Local SQLite database interface (@vertz/sqlite / better-sqlite3)
// ---------------------------------------------------------------------------

interface LocalSqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number };
  };
  exec(sql: string): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// resolveLocalSqliteDatabase — resolve @vertz/sqlite or better-sqlite3
// ---------------------------------------------------------------------------

/**
 * Resolve a local SQLite database using @vertz/sqlite or better-sqlite3.
 *
 * Tries @vertz/sqlite first (vtz/Bun runtime), then falls back to better-sqlite3 (Node.js).
 * If both fail, throws a descriptive error with both failure reasons.
 *
 * @param dbPath - Path to SQLite file, or ':memory:' for in-memory
 * @param importFn - Optional import function for testing (defaults to dynamic import)
 * @returns A LocalSqliteDatabase instance
 */
export async function resolveLocalSqliteDatabase(
  dbPath: string,
  importFn?: (mod: string) => unknown,
): Promise<LocalSqliteDatabase> {
  let sqliteError: unknown;

  // Use provided import function (for testing) or dynamic import
  const loadModule = importFn ?? ((mod: string) => import(mod));

  try {
    // Try @vertz/sqlite first (vtz/Bun runtime)
    const mod = (await loadModule('@vertz/sqlite')) as {
      Database: new (path: string) => LocalSqliteDatabase;
      default?: { Database: new (path: string) => LocalSqliteDatabase };
    };
    // Handle ESM interop: import() may return { default: { Database } } or { Database }
    const Database = mod.Database ?? mod.default?.Database;
    if (!Database) throw new Error('@vertz/sqlite module has no Database export');
    return new Database(dbPath);
  } catch (e) {
    sqliteError = e;
  }

  try {
    // Fall back to better-sqlite3 (Node.js runtime)
    const mod = (await loadModule('better-sqlite3')) as Record<string, unknown>;
    // Handle ESM interop: import() may return { default: Constructor } or Constructor
    const Database = (typeof mod === 'function' ? mod : mod.default) as new (
      path: string,
    ) => LocalSqliteDatabase;
    return new Database(dbPath);
  } catch (betterSqliteError) {
    const sqliteMsg = sqliteError instanceof Error ? sqliteError.message : String(sqliteError);
    const betterMsg =
      betterSqliteError instanceof Error ? betterSqliteError.message : String(betterSqliteError);

    throw new Error(
      `Failed to initialize SQLite database at "${dbPath}".\n` +
        `  @vertz/sqlite error: ${sqliteMsg}\n` +
        `  better-sqlite3 error: ${betterMsg}\n\n` +
        'To fix this, either:\n' +
        '  1. Run your script with vtz (e.g. vtz run <script> or vtz dev) — the Vertz\n' +
        '     runtime includes a built-in SQLite driver. See https://vertz.dev/runtime\n' +
        '  2. Install better-sqlite3: npm install better-sqlite3',
    );
  }
}

// ---------------------------------------------------------------------------
// createLocalSqliteDriver — factory for @vertz/sqlite / better-sqlite3
// ---------------------------------------------------------------------------

/**
 * Create a SQLite driver from a local file path using @vertz/sqlite or better-sqlite3.
 *
 * @param dbPath - Path to SQLite file, or ':memory:' for in-memory
 * @param tableSchema - Optional table schema registry for value conversion
 * @returns A SqliteDriver with query, execute, close, and isHealthy methods
 */
export async function createLocalSqliteDriver(
  dbPath: string,
  tableSchema?: TableSchemaRegistry,
): Promise<SqliteDriver> {
  // Dynamic import to avoid crashing Cloudflare Workers
  // (this function is only called for local SQLite, never on Workers)
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Auto-create parent directories for file-based paths
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = await resolveLocalSqliteDatabase(dbPath);

  // Enforce FK constraints declared in CREATE TABLE. SQLite's upstream default
  // is OFF; bun:sqlite / better-sqlite3 happen to compile with it ON, but
  // relying on that would silently regress autoApply FK enforcement on any
  // backend that ships with the library's default.
  db.exec('PRAGMA foreign_keys = ON');

  // Enable WAL mode for file-based paths (not :memory:)
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }

  const convertParams = (params?: unknown[]): unknown[] | undefined => {
    if (!params) return params;
    return params.map(toSqliteValue);
  };

  const convertRow = <T>(row: Record<string, unknown>, sql: string): T => {
    if (!tableSchema) return row as T;

    const tableName = extractTableName(sql);
    if (!tableName) return row as T;

    const schema = tableSchema.get(tableName);
    if (!schema) return row as T;

    return convertRowWithSchema<T>(row, schema, tableName);
  };

  const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    const stmt = db.prepare(sql);
    const convertedParams = convertParams(params);
    const rows = convertedParams ? stmt.all(...convertedParams) : stmt.all();
    return rows.map((row) => convertRow<T>(row as Record<string, unknown>, sql));
  };

  const execute = async (sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> => {
    const stmt = db.prepare(sql);
    const convertedParams = convertParams(params);
    const result = convertedParams ? stmt.run(...convertedParams) : stmt.run();
    return { rowsAffected: result.changes };
  };

  return {
    query,
    execute,
    close: async () => {
      db.close();
    },
    isHealthy: async () => {
      try {
        await query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
  };
}
