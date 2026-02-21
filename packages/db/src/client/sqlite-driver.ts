/**
 * SQLite driver adapter — wraps Cloudflare D1 for use with createDb.
 *
 * Provides a DbDriver interface that wraps D1's prepare/bind/all/run API.
 */

import type { DbDriver } from './driver';
import { fromSqliteValue } from './sqlite-value-converter';

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
 * Table schema registry mapping table names to their column definitions.
 * Maps tableName → { columnName → columnType }
 */
export type TableSchemaRegistry = Map<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// Helper: Build table schema from table entries
// ---------------------------------------------------------------------------

import type { TableEntry } from '../schema/inference';
import type { ColumnMetadata } from '../schema/column';

/**
 * Builds a table schema registry from table entries.
 * Extracts column names and their SQL types from the table definitions.
 */
export function buildTableSchema<TTables extends Record<string, TableEntry>>(
  tables: TTables,
): TableSchemaRegistry {
  const registry = new Map<string, Record<string, string>>();

  for (const [, entry] of Object.entries(tables)) {
    const tableName = entry.table._name;
    const columnTypes: Record<string, string> = {};

    for (const [colName, colBuilder] of Object.entries(entry.table._columns)) {
      // ColumnBuilder has _meta with sqlType
      const meta = (colBuilder as unknown as { _meta: ColumnMetadata })._meta;
      columnTypes[colName] = meta.sqlType;
    }

    registry.set(tableName, columnTypes);
  }

  return registry;
}

// ---------------------------------------------------------------------------
// Helper: Extract table name from SQL query
// ---------------------------------------------------------------------------

/**
 * Extracts the table name from a SQL query.
 * Handles SELECT, INSERT, UPDATE, DELETE statements.
 */
function extractTableName(sql: string): string | null {
  const normalized = sql.trim().toUpperCase();

  // SELECT ... FROM tablename
  const fromMatch = normalized.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (fromMatch) {
    return fromMatch[1]!.toLowerCase();
  }

  // INSERT INTO tablename
  const insertMatch = normalized.match(/\bINSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (insertMatch) {
    return insertMatch[1]!.toLowerCase();
  }

  // UPDATE tablename
  const updateMatch = normalized.match(/\bUPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (updateMatch) {
    return updateMatch[1]!.toLowerCase();
  }

  // DELETE FROM tablename
  const deleteMatch = normalized.match(/\bDELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
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
          // Convert each row's values based on column types
          return result.results.map((row) => {
            const convertedRow: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
              const columnType = schema[key];
              if (columnType) {
                convertedRow[key] = fromSqliteValue(value, columnType);
              } else {
                convertedRow[key] = value;
              }
            }
            return convertedRow as T;
          });
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
