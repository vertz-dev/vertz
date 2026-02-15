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

import postgresLib from 'postgres';
import type { ExecutorResult, QueryFn } from '../query/executor';
import type { PoolConfig } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The postgres.js Sql instance (connection pool). */
type PostgresSql = ReturnType<typeof postgresLib>;

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

export interface PostgresDriver {
  /** The QueryFn adapter for use with createDb. */
  readonly queryFn: QueryFn;
  /** Close all connections in the pool. */
  close(): Promise<void>;
  /** Check connection health with SELECT 1. */
  isHealthy(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// createPostgresDriver — factory
// ---------------------------------------------------------------------------

/**
 * Create a PostgreSQL driver from a connection URL and optional pool config.
 *
 * @param url - PostgreSQL connection URL (e.g., postgres://user:pass@host:5432/db)
 * @param pool - Optional pool configuration
 * @param replicas - Optional array of read replica URLs for query routing
 * @returns A PostgresDriver with queryFn, close(), and isHealthy()
 */
export function createPostgresDriver(
  url: string,
  pool?: PoolConfig,
  replicas?: readonly string[],
): PostgresDriver {
  // Support replicas via third parameter or pool config
  const replicaUrls = replicas ?? pool?.replicas ?? [];
  const hasReplicas = replicaUrls.length > 0;
  const sql: PostgresSql = postgresLib(url, {
    max: pool?.max ?? 10,
    idle_timeout: pool?.idleTimeout !== undefined ? pool.idleTimeout / 1000 : 30,
    connect_timeout: pool?.connectionTimeout !== undefined ? pool.connectionTimeout / 1000 : 10,
    // Disable automatic type fetching — we handle type conversion ourselves
    // to ensure consistent behavior with PGlite tests
    fetch_types: false,
  });

  // Create replica pools if replicas are configured
  let replicaPools: PostgresSql[] = [];
  let currentReplicaIndex = 0;

  if (hasReplicas) {
    replicaPools = replicaUrls.map((replicaUrl) =>
      postgresLib(replicaUrl, {
        max: pool?.max ?? 10,
        idle_timeout: pool?.idleTimeout !== undefined ? pool.idleTimeout / 1000 : 30,
        connect_timeout: pool?.connectionTimeout !== undefined ? pool.connectionTimeout / 1000 : 10,
        fetch_types: false,
      }),
    );
  }

  /**
   * Check if a query is a read-only query (SELECT).
   * Used for routing read queries to replicas.
   */
  function isReadQuery(sqlStr: string): boolean {
    const trimmed = sqlStr.trim().toUpperCase();
    return trimmed.startsWith('SELECT');
  }

  /**
   * Get the next replica in round-robin fashion.
   * Returns null if no replicas are configured.
   */
  function getNextReplica(): PostgresSql | null {
    if (replicaPools.length === 0) return null;
    const replica = replicaPools[currentReplicaIndex];
    currentReplicaIndex = (currentReplicaIndex + 1) % replicaPools.length;
    return replica ?? null;
  }

  const queryFn: QueryFn = async <T>(sqlStr: string, params: readonly unknown[]) => {
    try {
      // Route SELECT queries to replicas if available
      let poolToUse: PostgresSql;
      if (hasReplicas && isReadQuery(sqlStr)) {
        const replica = getNextReplica();
        poolToUse = replica ?? sql; // Fallback to primary if no replica
      } else {
        poolToUse = sql;
      }

      // biome-ignore lint/suspicious/noExplicitAny: postgres.js unsafe() expects any[] for dynamic params
      const result = await poolToUse.unsafe<Record<string, unknown>[]>(sqlStr, params as any[]);

      // Map rows: convert timestamp strings to Date objects
      const rows = result.map((row) => {
        const mapped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          mapped[key] = coerceValue(value);
        }
        return mapped;
      }) as readonly T[];

      return {
        rows,
        rowCount: result.count ?? rows.length,
      } as ExecutorResult<T>;
    } catch (error: unknown) {
      adaptPostgresError(error);
    }
  };

  return {
    queryFn,

    async close(): Promise<void> {
      // Close primary pool
      await sql.end();
      // Close all replica pools
      await Promise.all(replicaPools.map((pool) => pool.end()));
    },

    async isHealthy(): Promise<boolean> {
      try {
        const healthCheckTimeout = pool?.healthCheckTimeout ?? 5000;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timed out')), healthCheckTimeout),
        );
        await Promise.race([sql`SELECT 1`, timeout]);
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

/**
 * Coerce values returned from PostgreSQL to appropriate JS types.
 *
 * postgres.js returns most types correctly, but when fetch_types is disabled,
 * timestamp values may come as strings. This function ensures:
 * - ISO 8601 timestamp strings → Date objects
 * - Everything else passes through unchanged
 *
 * **⚠️ False-positive risk:** This heuristic coerces ANY string matching the
 * ISO 8601 timestamp pattern (e.g., `"2024-01-15T10:30:00Z"`) into a `Date`,
 * even if the column is a plain `text` type. If you store timestamp-like
 * strings in text columns, they will be silently converted to Date objects.
 *
 * A future iteration may add column-type-aware coercion to eliminate this
 * risk by inspecting the PG column OID or schema metadata.
 */
function coerceValue(value: unknown): unknown {
  if (typeof value === 'string' && isTimestampString(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
}

/**
 * Check if a string looks like an ISO 8601 timestamp from PostgreSQL.
 *
 * Matches patterns like:
 * - "2024-01-15T10:30:00.000Z"
 * - "2024-01-15 10:30:00+00"
 * - "2024-01-15 10:30:00.123456+00:00"
 *
 * **Note:** This is a heuristic check using regex. Any string column value
 * matching this pattern will be coerced to a Date object, which may produce
 * false positives for text columns containing timestamp-formatted strings.
 * See {@link coerceValue} for details on the false-positive risk.
 */
function isTimestampString(value: string): boolean {
  // Must start with a date pattern YYYY-MM-DD and contain time separator
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value);
}
