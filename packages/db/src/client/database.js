import * as agg from '../query/aggregate';
import * as crud from '../query/crud';
import { executeQuery } from '../query/executor';
import { loadRelations } from '../query/relation-loader';
import { createPostgresDriver } from './postgres-driver';
import { computeTenantGraph } from './tenant-graph';
// ---------------------------------------------------------------------------
// Query routing
// ---------------------------------------------------------------------------
/**
 * Determines if a SQL query is a read-only query that can be routed to replicas.
 *
 * This function detects SELECT statements, including:
 * - Standard SELECT queries
 * - WITH ... SELECT (CTEs) - only if SELECT is the only/top-level DML
 * - Queries with leading comments
 *
 * Returns false for:
 * - INSERT, UPDATE, DELETE, TRUNCATE
 * - Writable CTEs: WITH ... INSERT/UPDATE/DELETE (writes inside CTE)
 * - SELECT ... FOR UPDATE/FOR NO KEY UPDATE/FOR SHARE/FOR KEY SHARE (acquire locks)
 * - SELECT INTO (creates table)
 * - DDL statements (CREATE, ALTER, DROP)
 * - Transaction commands (BEGIN, COMMIT, ROLLBACK)
 * - Any statement not starting with SELECT after normalization
 */
export function isReadQuery(sqlStr) {
  // Remove leading comments and whitespace
  let normalized = sqlStr.trim();
  // Strip leading comment lines (-- and /* */)
  while (
    normalized.startsWith('--') ||
    normalized.startsWith('/*') ||
    normalized.startsWith('//')
  ) {
    // Find end of comment
    if (normalized.startsWith('--')) {
      const newlineIdx = normalized.indexOf('\n');
      if (newlineIdx === -1) return false;
      normalized = normalized.slice(newlineIdx + 1).trim();
    } else if (normalized.startsWith('/*')) {
      const endIdx = normalized.indexOf('*/');
      if (endIdx === -1) return false;
      normalized = normalized.slice(endIdx + 2).trim();
    } else if (normalized.startsWith('//')) {
      const newlineIdx = normalized.indexOf('\n');
      if (newlineIdx === -1) return false;
      normalized = normalized.slice(newlineIdx + 1).trim();
    }
  }
  const upper = normalized.toUpperCase();
  // Handle CTEs (WITH clause) - check for DML verbs inside CTE
  if (upper.startsWith('WITH ')) {
    // Check if CTE contains writable operations (INSERT, UPDATE, DELETE)
    const hasInsert = /\bINSERT\s+INTO\b/is.test(normalized);
    const hasUpdate = /\bUPDATE\b/is.test(normalized);
    const hasDelete = /\bDELETE\s+FROM\b/is.test(normalized);
    // If there's INSERT/UPDATE/DELETE in the query, it's a write
    if (hasInsert || hasUpdate || hasDelete) {
      return false;
    }
    // Otherwise, check for SELECT
    const selectMatch = normalized.match(/\bSELECT\s/is);
    return selectMatch !== null;
  }
  // Check for SELECT ... FOR UPDATE/FOR NO KEY UPDATE/FOR SHARE/FOR KEY SHARE
  // These acquire row-level locks and should go to primary
  if (/\bFOR\s+(NO\s+KEY\s+)?(UPDATE|KEY\s+SHARE|SHARE)\b/is.test(upper)) {
    return false;
  }
  // Check if the first meaningful keyword is SELECT
  // SELECT INTO creates a table, so it's a WRITE operation
  // Match both "SELECT INTO" and "SELECT ... INTO" patterns
  if (upper.startsWith('SELECT INTO') || /\bSELECT\s+.+\s+INTO\b/.test(upper)) {
    return false;
  }
  return upper.startsWith('SELECT');
}
// ---------------------------------------------------------------------------
// Resolve table entry helper
// ---------------------------------------------------------------------------
function resolveTable(tables, name) {
  const entry = tables[name];
  if (!entry) {
    throw new Error(`Table "${name}" is not registered in the database.`);
  }
  return entry;
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
 * When `url` is provided and `_queryFn` is NOT provided, creates a real
 * postgres connection using the `postgres` package (porsager/postgres).
 * The `_queryFn` escape hatch still works for testing with PGlite.
 *
 * **Timestamp coercion:** The postgres driver automatically converts string
 * values matching ISO 8601 timestamp patterns to `Date` objects. This applies
 * to all columns, not just declared timestamp columns. If you store
 * timestamp-formatted strings in plain text columns, they will be coerced
 * to `Date` objects. See the postgres-driver source for details.
 *
 * **Connection pool defaults:** When no `pool.idleTimeout` is specified,
 * idle connections are closed after 30 seconds. Set `idleTimeout` explicitly
 * to override (value in milliseconds, e.g., `60000` for 60s).
 */
export function createDb(options) {
  const { tables, log } = options;
  // Compute tenant graph from table registry metadata
  const tenantGraph = computeTenantGraph(tables);
  // Log notices for unscoped tables
  if (log && tenantGraph.root !== null) {
    const allScoped = new Set([
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
  // Pre-compute the table registry for relation loading
  // TableEntry is structurally compatible with TableRegistryEntry
  const tablesRegistry = tables;
  // Create the postgres driver if _queryFn is not provided
  let driver = null;
  let replicaDrivers = [];
  let replicaIndex = 0;
  const queryFn = (() => {
    // If _queryFn is explicitly provided (e.g., PGlite for testing), use it
    if (options._queryFn) {
      return options._queryFn;
    }
    // Otherwise, create a real postgres driver from the URL
    if (options.url) {
      driver = createPostgresDriver(options.url, options.pool);
      // Create replica drivers if configured
      const replicas = options.pool?.replicas;
      if (replicas && replicas.length > 0) {
        replicaDrivers = replicas.map((replicaUrl) =>
          createPostgresDriver(replicaUrl, options.pool),
        );
      }
      // Return a routing-aware query function
      return async (sqlStr, params) => {
        // If no replicas configured, always use primary
        if (replicaDrivers.length === 0) {
          return driver.queryFn(sqlStr, params);
        }
        // Route read queries to replicas with round-robin and fallback on failure
        if (isReadQuery(sqlStr)) {
          const targetReplica = replicaDrivers[replicaIndex];
          replicaIndex = (replicaIndex + 1) % replicaDrivers.length;
          try {
            return await targetReplica.queryFn(sqlStr, params);
          } catch (err) {
            // Replica failed, fall back to primary
            console.warn('[vertz/db] replica query failed, falling back to primary:', err.message);
          }
        }
        // Write queries always go to primary
        return driver.queryFn(sqlStr, params);
      };
    }
    // Fallback: no driver, no _queryFn — throw on query
    return async () => {
      throw new Error(
        'db.query() requires a connected postgres driver. ' +
          'Provide a `url` to connect to PostgreSQL, or `_queryFn` for testing.',
      );
    };
  })();
  return {
    _tables: tables,
    $tenantGraph: tenantGraph,
    async query(fragment) {
      return executeQuery(queryFn, fragment.sql, fragment.params);
    },
    async close() {
      // Close primary driver
      if (driver) {
        await driver.close();
      }
      // Close all replica drivers
      await Promise.all(replicaDrivers.map((r) => r.close()));
    },
    async isHealthy() {
      if (driver) {
        return driver.isHealthy();
      }
      // When using _queryFn (PGlite), assume healthy
      return true;
    },
    // -----------------------------------------------------------------------
    // Query methods
    // -----------------------------------------------------------------------
    async get(name, opts) {
      const entry = resolveTable(tables, name);
      const result = await crud.get(queryFn, entry.table, opts);
      if (result !== null && opts?.include) {
        const rows = await loadRelations(
          queryFn,
          [result],
          entry.relations,
          opts.include,
          0,
          tablesRegistry,
          entry.table,
        );
        return rows[0] ?? null;
      }
      return result;
    },
    async getOrThrow(name, opts) {
      const entry = resolveTable(tables, name);
      const result = await crud.getOrThrow(queryFn, entry.table, opts);
      if (opts?.include) {
        const rows = await loadRelations(
          queryFn,
          [result],
          entry.relations,
          opts.include,
          0,
          tablesRegistry,
          entry.table,
        );
        return rows[0];
      }
      return result;
    },
    async list(name, opts) {
      const entry = resolveTable(tables, name);
      const results = await crud.list(queryFn, entry.table, opts);
      if (opts?.include && results.length > 0) {
        return loadRelations(
          queryFn,
          results,
          entry.relations,
          opts.include,
          0,
          tablesRegistry,
          entry.table,
        );
      }
      return results;
    },
    async listAndCount(name, opts) {
      const entry = resolveTable(tables, name);
      const { data, total } = await crud.listAndCount(queryFn, entry.table, opts);
      if (opts?.include && data.length > 0) {
        const withRelations = await loadRelations(
          queryFn,
          data,
          entry.relations,
          opts.include,
          0,
          tablesRegistry,
          entry.table,
        );
        return { data: withRelations, total };
      }
      return { data, total };
    },
    // Deprecated aliases
    get findOne() {
      return this.get;
    },
    get findOneOrThrow() {
      return this.getOrThrow;
    },
    get findMany() {
      return this.list;
    },
    get findManyAndCount() {
      return this.listAndCount;
    },
    // -----------------------------------------------------------------------
    // Create queries
    // -----------------------------------------------------------------------
    async create(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.create(queryFn, entry.table, opts);
    },
    async createMany(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.createMany(queryFn, entry.table, opts);
    },
    async createManyAndReturn(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.createManyAndReturn(queryFn, entry.table, opts);
    },
    // -----------------------------------------------------------------------
    // Update queries
    // -----------------------------------------------------------------------
    async update(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.update(queryFn, entry.table, opts);
    },
    async updateMany(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.updateMany(queryFn, entry.table, opts);
    },
    // -----------------------------------------------------------------------
    // Upsert
    // -----------------------------------------------------------------------
    async upsert(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.upsert(queryFn, entry.table, opts);
    },
    // -----------------------------------------------------------------------
    // Delete queries
    // -----------------------------------------------------------------------
    async delete(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.deleteOne(queryFn, entry.table, opts);
    },
    async deleteMany(name, opts) {
      const entry = resolveTable(tables, name);
      return crud.deleteMany(queryFn, entry.table, opts);
    },
    // -----------------------------------------------------------------------
    // Aggregation queries
    // -----------------------------------------------------------------------
    async count(name, opts) {
      const entry = resolveTable(tables, name);
      return agg.count(queryFn, entry.table, opts);
    },
    async aggregate(name, opts) {
      const entry = resolveTable(tables, name);
      return agg.aggregate(queryFn, entry.table, opts);
    },
    async groupBy(name, opts) {
      const entry = resolveTable(tables, name);
      return agg.groupBy(queryFn, entry.table, opts);
    },
  };
}
//# sourceMappingURL=database.js.map
