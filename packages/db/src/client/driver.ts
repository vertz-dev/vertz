/**
 * Database driver interface.
 *
 * Provides a unified interface for different database backends
 * (PostgreSQL, SQLite/D1, etc.) with query and execute methods.
 */

export interface DbDriver {
  /**
   * Execute a read query and return results.
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a write query and return affected row count.
   */
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;

  /**
   * Close the database connection.
   */
  close(): Promise<void>;
}
