import * as agg from '../query/aggregate';
import * as crud from '../query/crud';
import { executeQuery, type QueryFn } from '../query/executor';
import { type IncludeSpec, loadRelations, type TableRegistryEntry } from '../query/relation-loader';
import type {
  FilterType,
  FindResult,
  IncludeOption,
  InsertInput,
  OrderByType,
  SelectOption,
  TableEntry,
  UpdateInput,
} from '../schema/inference';
import type { RelationDef } from '../schema/relation';
import type { SqlFragment } from '../sql/tagged';
import { createPostgresDriver, type PostgresDriver } from './postgres-driver';
import { computeTenantGraph, type TenantGraph } from './tenant-graph';
import { ok, err, type Result } from '@vertz/schema';
import {
  NotFoundError,
  type ReadError,
  type WriteError,
  toReadError,
  toWriteError,
} from '../errors';

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
export function isReadQuery(sqlStr: string): boolean {
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
// Pool configuration
// ---------------------------------------------------------------------------

export interface PoolConfig {
  /** Maximum number of connections in the pool. */
  readonly max?: number;
  /**
   * Idle timeout in milliseconds before a connection is closed.
   * Defaults to 30000 (30 seconds) if not specified, preventing
   * idle connections from staying open indefinitely.
   */
  readonly idleTimeout?: number;
  /** Connection timeout in milliseconds. */
  readonly connectionTimeout?: number;
  /**
   * Health check timeout in milliseconds.
   * Used by isHealthy() to prevent hanging on degraded databases.
   * Defaults to 5000 (5 seconds) if not specified.
   */
  readonly healthCheckTimeout?: number;
  /**
   * Read replica URLs for query routing.
   * Read-only queries (SELECT) can be routed to replicas for load balancing.
   * The primary URL is always used for writes (INSERT, UPDATE, DELETE).
   */
  readonly replicas?: readonly string[];
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
  /**
   * Raw query function injected by the driver layer.
   * If not provided, query methods will throw.
   * @internal — primarily for testing with PGlite.
   */
  readonly _queryFn?: QueryFn;
}

// ---------------------------------------------------------------------------
// Query result
// ---------------------------------------------------------------------------

export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

// ---------------------------------------------------------------------------
// Type helpers — extract table/relations from TTables entry
// ---------------------------------------------------------------------------

/** Extract the TableDef from a TableEntry. */
type EntryTable<TEntry extends TableEntry> = TEntry['table'];

/** Extract the relations record from a TableEntry. */
type EntryRelations<TEntry extends TableEntry> = TEntry['relations'];

/** Extract columns from a TableEntry's table. */
type EntryColumns<TEntry extends TableEntry> = EntryTable<TEntry>['_columns'];

// ---------------------------------------------------------------------------
// Typed query option types
// ---------------------------------------------------------------------------

/** Options for get / getOrThrow — typed per-table. */
type TypedGetOptions<TEntry extends TableEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly include?: IncludeOption<EntryRelations<TEntry>>;
};

/** Options for list / listAndCount — typed per-table. */
type TypedListOptions<TEntry extends TableEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly limit?: number;
  readonly offset?: number;
  /** Cursor object: column-value pairs marking the position to paginate from. */
  readonly cursor?: Record<string, unknown>;
  /** Number of rows to take (used with cursor). Aliases `limit` when cursor is present. */
  readonly take?: number;
  readonly include?: IncludeOption<EntryRelations<TEntry>>;
};

/** Options for create — typed per-table. */
type TypedCreateOptions<TEntry extends TableEntry> = {
  readonly data: InsertInput<EntryTable<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for createManyAndReturn — typed per-table. */
type TypedCreateManyAndReturnOptions<TEntry extends TableEntry> = {
  readonly data: readonly InsertInput<EntryTable<TEntry>>[];
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for createMany — typed per-table. */
type TypedCreateManyOptions<TEntry extends TableEntry> = {
  readonly data: readonly InsertInput<EntryTable<TEntry>>[];
};

/** Options for update — typed per-table. */
type TypedUpdateOptions<TEntry extends TableEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly data: UpdateInput<EntryTable<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for updateMany — typed per-table. */
type TypedUpdateManyOptions<TEntry extends TableEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly data: UpdateInput<EntryTable<TEntry>>;
};

/** Options for upsert — typed per-table. */
type TypedUpsertOptions<TEntry extends TableEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly create: InsertInput<EntryTable<TEntry>>;
  readonly update: UpdateInput<EntryTable<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for delete — typed per-table. */
type TypedDeleteOptions<TEntry extends TableEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for deleteMany — typed per-table. */
type TypedDeleteManyOptions<TEntry extends TableEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
};

/** Options for count — typed per-table. */
type TypedCountOptions<TEntry extends TableEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
};

// ---------------------------------------------------------------------------
// Database instance interface — unified type (resolves follow-up #8)
// ---------------------------------------------------------------------------

export interface DatabaseInstance<TTables extends Record<string, TableEntry>> {
  /** The table registry for type-safe access. */
  readonly _tables: TTables;
  /** The computed tenant scoping graph. */
  readonly $tenantGraph: TenantGraph;

  /**
   * Execute a raw SQL query via the sql tagged template.
   */
  query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<Result<QueryResult<T>, ReadError>>;

  /**
   * Close all pool connections.
   */
  close(): Promise<void>;

  /**
   * Check if the database connection is healthy.
   */
  isHealthy(): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Query methods (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Get a single row or null.
   * Returns ok(null) when no record is found - absence is not an error.
   */
  get<TName extends keyof TTables & string, TOptions extends TypedGetOptions<TTables[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>> | null,
    ReadError
  >>;

  /**
   * Get a single row or return NotFoundError.
   * Use when absence of a record is an error condition.
   */
  getRequired<TName extends keyof TTables & string, TOptions extends TypedGetOptions<TTables[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>,
    ReadError
  >>;

  /**
   * List multiple rows.
   */
  list<TName extends keyof TTables & string, TOptions extends TypedListOptions<TTables[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[],
    ReadError
  >>;

  /**
   * List multiple rows with total count.
   */
  listAndCount<
    TName extends keyof TTables & string,
    TOptions extends TypedListOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<Result<
    {
      data: FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[];
      total: number;
    },
    ReadError
  >>;

  /** @deprecated Use `get` instead */
  findOne: DatabaseInstance<TTables>['get'];
  /** @deprecated Use `getRequired` instead */
  findOneRequired: DatabaseInstance<TTables>['getRequired'];
  /** @deprecated Use `list` instead */
  findMany: DatabaseInstance<TTables>['list'];
  /** @deprecated Use `listAndCount` instead */
  findManyAndCount: DatabaseInstance<TTables>['listAndCount'];

  // -------------------------------------------------------------------------
  // Create queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert a single row and return it.
   */
  create<TName extends keyof TTables & string, TOptions extends TypedCreateOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>,
    WriteError
  >>;

  /**
   * Insert multiple rows and return the count.
   */
  createMany<TName extends keyof TTables & string>(
    table: TName,
    options: TypedCreateManyOptions<TTables[TName]>,
  ): Promise<Result<{ count: number }, WriteError>>;

  /**
   * Insert multiple rows and return them.
   */
  createManyAndReturn<
    TName extends keyof TTables & string,
    TOptions extends TypedCreateManyAndReturnOptions<TTables[TName]>,
  >(
    table: TName,
    options: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[],
    WriteError
  >>;

  // -------------------------------------------------------------------------
  // Update queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Update matching rows and return the first.
   * Returns NotFoundError if no rows match.
   */
  update<TName extends keyof TTables & string, TOptions extends TypedUpdateOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>,
    WriteError
  >>;

  /**
   * Update matching rows and return the count.
   */
  updateMany<TName extends keyof TTables & string>(
    table: TName,
    options: TypedUpdateManyOptions<TTables[TName]>,
  ): Promise<Result<{ count: number }, WriteError>>;

  // -------------------------------------------------------------------------
  // Upsert (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert or update a row.
   */
  upsert<TName extends keyof TTables & string, TOptions extends TypedUpsertOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>,
    WriteError
  >>;

  // -------------------------------------------------------------------------
  // Delete queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Delete a matching row and return it.
   * Returns NotFoundError if no rows match.
   */
  delete<TName extends keyof TTables & string, TOptions extends TypedDeleteOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<Result<
    FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>,
    WriteError
  >>;

  /**
   * Delete matching rows and return the count.
   */
  deleteMany<TName extends keyof TTables & string>(
    table: TName,
    options: TypedDeleteManyOptions<TTables[TName]>,
  ): Promise<Result<{ count: number }, WriteError>>;

  // -------------------------------------------------------------------------
  // Aggregation queries (DB-012)
  // -------------------------------------------------------------------------

  /**
   * Count rows matching an optional filter.
   */
  count<TName extends keyof TTables & string>(
    table: TName,
    options?: TypedCountOptions<TTables[TName]>,
  ): Promise<Result<number, ReadError>>;

  /**
   * Run aggregation functions on a table.
   */
  aggregate<TName extends keyof TTables & string>(
    table: TName,
    options: agg.AggregateArgs,
  ): Promise<Result<Record<string, unknown>, ReadError>>;

  /**
   * Group rows by columns and apply aggregation functions.
   */
  groupBy<TName extends keyof TTables & string>(
    table: TName,
    options: agg.GroupByArgs,
  ): Promise<Result<Record<string, unknown>[], ReadError>>;
}

// ---------------------------------------------------------------------------
// Resolve table entry helper
// ---------------------------------------------------------------------------

function resolveTable<TTables extends Record<string, TableEntry>>(
  tables: TTables,
  name: string,
): TableEntry {
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

  // Pre-compute the table registry for relation loading
  // TableEntry is structurally compatible with TableRegistryEntry
  const tablesRegistry = tables as Record<string, TableRegistryEntry>;

  // Create the postgres driver if _queryFn is not provided
  let driver: PostgresDriver | null = null;
  let replicaDrivers: PostgresDriver[] = [];
  let replicaIndex = 0;

  const queryFn: QueryFn = (() => {
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
        replicaDrivers = replicas.map((replicaUrl) => createPostgresDriver(replicaUrl, options.pool));
      }

      // Return a routing-aware query function
      return async <T>(sqlStr: string, params: readonly unknown[]) => {
        // If no replicas configured, always use primary
        if (replicaDrivers.length === 0) {
          return driver!.queryFn<T>(sqlStr, params);
        }

        // Route read queries to replicas with round-robin and fallback on failure
        if (isReadQuery(sqlStr)) {
          const targetReplica = replicaDrivers[replicaIndex]!;
          replicaIndex = (replicaIndex + 1) % replicaDrivers.length;
          try {
            return await targetReplica.queryFn<T>(sqlStr, params);
          } catch (err) {
            // Replica failed, fall back to primary
            console.warn('[vertz/db] replica query failed, falling back to primary:', (err as Error).message);
          }
        }

        // Write queries always go to primary
        return driver!.queryFn<T>(sqlStr, params);
      };
    }

    // Fallback: no driver, no _queryFn — throw on query
    return (async () => {
      throw new Error(
        'db.query() requires a connected postgres driver. ' +
          'Provide a `url` to connect to PostgreSQL, or `_queryFn` for testing.',
      );
    }) as QueryFn;
  })();

  // -----------------------------------------------------------------------
  // Implementation note: The interface provides fully typed signatures.
  // Internally, the CRUD functions use Record<string, unknown> at runtime.
  // We use `as any` on the return type to bridge the gap — the external
  // contract (DatabaseInstance<TTables>) ensures type safety for callers.
  // -----------------------------------------------------------------------

  // biome-ignore lint/suspicious/noExplicitAny: Internal implementation bridges typed interface to untyped CRUD layer
  type AnyResult = any;

  return {
    _tables: tables,
    $tenantGraph: tenantGraph,

    async query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<Result<QueryResult<T>, ReadError>> {
      try {
        const result = await executeQuery<T>(queryFn, fragment.sql, fragment.params);
        return ok(result);
      } catch (e) {
        return err(toReadError(e, fragment.sql));
      }
    },

    async close(): Promise<void> {
      // Close primary driver
      if (driver) {
        await driver.close();
      }
      // Close all replica drivers
      await Promise.all(replicaDrivers.map((r) => r.close()));
    },

    async isHealthy(): Promise<boolean> {
      if (driver) {
        return driver.isHealthy();
      }
      // When using _queryFn (PGlite), assume healthy
      return true;
    },

    // -----------------------------------------------------------------------
    // Query methods
    // -----------------------------------------------------------------------

    async get(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.get(queryFn, entry.table, opts as crud.GetArgs);
        if (result !== null && opts?.include) {
          const rows = await loadRelations(
            queryFn,
            [result as Record<string, unknown>],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            tablesRegistry,
            entry.table,
          );
          return ok(rows[0] ?? null);
        }
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async getRequired(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.get(queryFn, entry.table, opts as crud.GetArgs);
        if (result === null) {
          return err(new NotFoundError(name));
        }
        if (opts?.include) {
          const rows = await loadRelations(
            queryFn,
            [result as Record<string, unknown>],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            tablesRegistry,
            entry.table,
          );
          return ok(rows[0] as Record<string, unknown>);
        }
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async list(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const results = await crud.list(queryFn, entry.table, opts as crud.ListArgs);
        if (opts?.include && results.length > 0) {
          const withRelations = await loadRelations(
            queryFn,
            results as Record<string, unknown>[],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            tablesRegistry,
            entry.table,
          );
          return ok(withRelations);
        }
        return ok(results);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async listAndCount(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const { data, total } = await crud.listAndCount(queryFn, entry.table, opts as crud.ListArgs);
        if (opts?.include && data.length > 0) {
          const withRelations = await loadRelations(
            queryFn,
            data as Record<string, unknown>[],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            tablesRegistry,
            entry.table,
          );
          return ok({ data: withRelations, total });
        }
        return ok({ data, total });
      } catch (e) {
        return err(toReadError(e));
      }
    },

    // Deprecated aliases
    get findOne() {
      return this.get;
    },
    get findOneRequired() {
      return this.getRequired;
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

    async create(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.create(queryFn, entry.table, opts as crud.CreateArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async createMany(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.createMany(queryFn, entry.table, opts as crud.CreateManyArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async createManyAndReturn(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.createManyAndReturn(queryFn, entry.table, opts as crud.CreateManyAndReturnArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    // -----------------------------------------------------------------------
    // Update queries
    // -----------------------------------------------------------------------

    async update(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.update(queryFn, entry.table, opts as crud.UpdateArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async updateMany(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.updateMany(queryFn, entry.table, opts as crud.UpdateManyArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    // -----------------------------------------------------------------------
    // Upsert
    // -----------------------------------------------------------------------

    async upsert(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.upsert(queryFn, entry.table, opts as crud.UpsertArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    // -----------------------------------------------------------------------
    // Delete queries
    // -----------------------------------------------------------------------

    async delete(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.deleteOne(queryFn, entry.table, opts as crud.DeleteArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async deleteMany(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await crud.deleteMany(queryFn, entry.table, opts as crud.DeleteManyArgs);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    // -----------------------------------------------------------------------
    // Aggregation queries
    // -----------------------------------------------------------------------

    async count(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await agg.count(queryFn, entry.table, opts as { where?: Record<string, unknown> });
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async aggregate(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await agg.aggregate(queryFn, entry.table, opts);
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async groupBy(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveTable(tables, name);
        const result = await agg.groupBy(queryFn, entry.table, opts);
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },
  };
}
