import type { TableEntry } from '../schema/inference';
import type { SqlFragment } from '../sql/tagged';
import { computeTenantGraph, type TenantGraph } from './tenant-graph';

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

export interface PoolConfig {
  /** Maximum number of connections in the pool. */
  readonly max?: number;
  /** Idle timeout in milliseconds before a connection is closed. */
  readonly idleTimeout?: number;
  /** Connection timeout in milliseconds. */
  readonly connectionTimeout?: number;
}

// ---------------------------------------------------------------------------
// createDb options
// ---------------------------------------------------------------------------

export interface CreateDbOptions<TTables extends Record<string, TableEntry>> {
  /** PostgreSQL connection URL. */
  readonly url: string;
  /** Table registry mapping logical names to table definitions + relations. */
  readonly tables: TTables;
  /** Connection pool configuration. */
  readonly pool?: PoolConfig;
  /** Column name casing strategy. */
  readonly casing?: 'snake_case' | 'camelCase';
  /** Log function for notices (e.g., unscoped table warnings). */
  readonly log?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Query result
// ---------------------------------------------------------------------------

export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

// ---------------------------------------------------------------------------
// Database instance interface
// ---------------------------------------------------------------------------

export interface DatabaseInstance<TTables extends Record<string, TableEntry>> {
  /** The table registry for type-safe access. */
  readonly _tables: TTables;
  /** The computed tenant scoping graph. */
  readonly $tenantGraph: TenantGraph;
  /**
   * Execute a raw SQL query via the sql tagged template.
   *
   * @example
   * ```ts
   * const users = await db.query<User>(sql`SELECT * FROM users WHERE id = ${id}`);
   * // users.rows: readonly User[]
   * ```
   *
   * Real execution requires a postgres driver connection.
   * Currently throws until driver integration lands.
   */
  query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<T>>;
  /**
   * Close all pool connections.
   * Stub — real implementation comes with postgres driver integration.
   */
  close(): Promise<void>;
  /**
   * Check if the database connection is healthy.
   * Stub — real implementation comes with postgres driver integration.
   */
  isHealthy(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// createDb — factory function
// ---------------------------------------------------------------------------

/**
 * Creates a typed Database instance.
 *
 * Computes the tenant graph at creation time from d.tenant() metadata,
 * traversing references to find indirect tenant paths.
 * Logs notices for tables without tenant paths and not .shared().
 *
 * Connection pool management is stubbed — real postgres driver
 * integration will be added in a later phase.
 */
export function createDb<TTables extends Record<string, TableEntry>>(
  options: CreateDbOptions<TTables>,
): DatabaseInstance<TTables> {
  const { tables, log } = options;

  // Compute tenant graph from table registry metadata
  const tenantGraph = computeTenantGraph(tables);

  // Log notices for unscoped tables
  if (log && tenantGraph.root !== null) {
    const allScoped = new Set<string>([
      ...(tenantGraph.root !== null ? [tenantGraph.root] : []),
      ...tenantGraph.directlyScoped,
      ...tenantGraph.indirectlyScoped,
      ...tenantGraph.shared,
    ]);

    for (const [key, entry] of Object.entries(tables)) {
      if (!allScoped.has(key)) {
        log(
          `[vertz/db] Table "${entry.table._name}" has no tenant path and is not marked .shared(). ` +
            'It will not be automatically scoped to a tenant.',
        );
      }
    }
  }

  return {
    _tables: tables,
    $tenantGraph: tenantGraph,

    async query<T = Record<string, unknown>>(_fragment: SqlFragment): Promise<QueryResult<T>> {
      throw new Error(
        'db.query() requires a connected postgres driver. ' +
          'Driver integration is not yet available — see the implementation plan for the driver phase.',
      );
    },

    async close(): Promise<void> {
      // Stub — real pool.end() will be called here when postgres driver is integrated
    },

    async isHealthy(): Promise<boolean> {
      // Stub — real health check (SELECT 1) will be done here when postgres driver is integrated
      return true;
    },
  };
}
