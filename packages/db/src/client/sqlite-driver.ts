/**
 * SQLite driver adapter — wraps Cloudflare D1 for use with createDb.
 *
 * Provides a DbDriver interface that wraps D1's prepare/bind/all/run API.
 */

import type { DbDriver } from './driver';

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
 * @returns A SqliteDriver with query, execute, close, and isHealthy methods
 */
export function createSqliteDriver(d1: D1Database): SqliteDriver {
  const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    const prepared = d1.prepare(sql);
    const bound = params ? prepared.bind(...params) : prepared;
    const result = await bound.all();
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
