/**
 * PostgreSQL driver adapter — wraps porsager/postgres for use with createDb.
 *
 * Converts the postgres.js tagged-template API to the QueryFn interface
 * expected by the query executor layer.
 *
 * Handles:
 * - Connection pool creation from URL + PoolConfig
 * - QueryFn adapter (sql.unsafe with parameter binding)
 * - Error mapping (postgres.js PostgresError → PgErrorInput shape)
 * - Connection close and health check
 */

import type { ExecutorResult, QueryFn } from '../query/executor';
import type { PoolConfig } from './database';
import type { DbDriver } from './driver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The postgres.js Sql instance (connection pool). */
type PostgresSql = import('postgres').Sql<{}>;

// ---------------------------------------------------------------------------
// Lazy-load postgres (optional peer dependency)
// ---------------------------------------------------------------------------

async function loadPostgres(): Promise<(...args: unknown[]) => PostgresSql> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded optional dep
    const mod = (await import('postgres')) as any;
    // Handle ESM interop: import() may return { default: fn } or fn directly
    return typeof mod === 'function' ? mod : mod.default;
  } catch {
    throw new Error('The "postgres" package is required for PostgreSQL. Install: bun add postgres');
  }
}

// ---------------------------------------------------------------------------
// Error adaptation
// ---------------------------------------------------------------------------

/**
 * Check if an error is a postgres.js PostgresError.
 * These have a `code` property (PG SQLSTATE) and structured metadata.
 */
function isPostgresError(error: unknown): error is {
  code: string;
  message: string;
  table_name?: string;
  column_name?: string;
  constraint_name?: string;
  detail?: string;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Adapt a postgres.js error to the PgErrorInput shape expected by parsePgError.
 *
 * postgres.js uses snake_case field names (table_name, column_name, constraint_name)
 * while our PgErrorInput uses shorter names (table, column, constraint).
 */
function adaptPostgresError(error: unknown): never {
  if (isPostgresError(error)) {
    // Re-throw with the shape expected by the executor's isPgError check
    const adapted = Object.assign(new Error(error.message), {
      code: error.code,
      message: error.message,
      table: error.table_name,
      column: error.column_name,
      constraint: error.constraint_name,
      detail: error.detail,
    });
    throw adapted;
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Driver interface
// ---------------------------------------------------------------------------

export interface PostgresDriver extends DbDriver {
  /** The QueryFn adapter for use with createDb. */
  readonly queryFn: QueryFn;
  /** Check connection health with SELECT 1. */
  isHealthy(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// createPostgresDriver — factory
// ---------------------------------------------------------------------------

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
export async function createPostgresDriver(url: string, pool?: PoolConfig): Promise<PostgresDriver> {
  const sql: PostgresSql = (await loadPostgres())(url, {
    max: pool?.max ?? 10,
    idle_timeout: pool?.idleTimeout !== undefined ? pool.idleTimeout / 1000 : 30,
    connect_timeout: pool?.connectionTimeout !== undefined ? pool.connectionTimeout / 1000 : 10,
    // Disable automatic type fetching — postgres.js handles standard types
    // (timestamps → Date, etc.) natively via built-in OID parsers.
    // fetch_types queries pg_type for custom/extension types on first connect,
    // which is unnecessary overhead for standard schemas.
    fetch_types: false,
  });

  const queryFn: QueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres.js unsafe() expects any[] for dynamic params
      const result = await sql.unsafe<Record<string, unknown>[]>(sqlStr, params as any[], {
        prepare: true,
      });

      return {
        rows: result as unknown as readonly T[],
        rowCount: result.count ?? result.length,
      } as ExecutorResult<T>;
    } catch (error: unknown) {
      adaptPostgresError(error);
    }
  };

  return {
    queryFn,
    query: async <T>(sql: string, params?: unknown[]) => {
      const result = await queryFn<T>(sql, params ?? []);
      return result.rows as T[];
    },
    execute: async (sql: string, params?: unknown[]) => {
      const result = await queryFn<Record<string, unknown>>(sql, params ?? []);
      return { rowsAffected: result.rowCount };
    },

    async beginTransaction<T>(fn: (txQueryFn: QueryFn) => Promise<T>): Promise<T> {
      // postgres.js begin() types return UnwrapPromiseArray<T> — at runtime T is already
      // unwrapped since fn returns Promise<T> and begin() awaits it, so the cast is safe.
      return sql.begin(async (txSql) => {
        const txQueryFn: QueryFn = async <R>(sqlStr: string, params: readonly unknown[]) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres.js unsafe() expects any[] for dynamic params
            const result = await txSql.unsafe<Record<string, unknown>[]>(sqlStr, params as any[], {
              prepare: true,
            });
            return {
              rows: result as unknown as readonly R[],
              rowCount: result.count ?? result.length,
            } as ExecutorResult<R>;
          } catch (error: unknown) {
            adaptPostgresError(error);
          }
        };
        return fn(txQueryFn);
      }) as Promise<T>;
    },

    async close(): Promise<void> {
      await sql.end();
    },

    async isHealthy(): Promise<boolean> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const healthCheckTimeout = pool?.healthCheckTimeout ?? 5000;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Health check timed out')), healthCheckTimeout);
        });
        await Promise.race([sql`SELECT 1`, timeout]);
        return true;
      } catch {
        return false;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
