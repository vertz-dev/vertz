/**
 * PostgreSQL driver adapter — wraps porsager/postgres for use with createDb.
 *
 * Converts the postgres.js tagged-template API to the QueryFn interface
 * expected by the query executor layer.
 *
 * Handles:
 * - Connection pool creation from URL + PoolConfig
 * - QueryFn adapter (sql.unsafe with parameter binding)
 * - Proper Date handling (postgres returns strings for timestamps)
 * - Error mapping (postgres.js PostgresError → PgErrorInput shape)
 * - Connection close and health check
 */
import type { QueryFn } from '../query/executor';
import type { PoolConfig } from './database';
export interface PostgresDriver {
  /** The QueryFn adapter for use with createDb. */
  readonly queryFn: QueryFn;
  /** Close all connections in the pool. */
  close(): Promise<void>;
  /** Check connection health with SELECT 1. */
  isHealthy(): Promise<boolean>;
}
/**
 * Create a PostgreSQL driver from a connection URL and optional pool config.
 *
 * Note: Query routing (to replicas) is handled at the database.ts layer (createDb).
 * This driver provides a simple connection to a single PostgreSQL instance.
 *
 * @param url - PostgreSQL connection URL (e.g., postgres://user:pass@host:5432/db)
 * @param pool - Optional pool configuration
 * @returns A PostgresDriver with queryFn, close(), and isHealthy()
 */
export declare function createPostgresDriver(url: string, pool?: PoolConfig): PostgresDriver;
//# sourceMappingURL=postgres-driver.d.ts.map
