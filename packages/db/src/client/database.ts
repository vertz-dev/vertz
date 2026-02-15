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

// ---------------------------------------------------------------------------
// Query routing
// ---------------------------------------------------------------------------

/**
 * Determines if a SQL query is a read-only query that can be routed to replicas.
 *
 * This function detects SELECT statements, including:
 * - Standard SELECT queries
 * - SELECT ... FOR UPDATE (still read-only, but we'll send to primary for safety)
 * - WITH ... SELECT (CTEs)
 * - Queries with leading comments
 *
 * Returns false for:
 * - INSERT, UPDATE, DELETE, TRUNCATE
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

  // Handle CTEs (WITH clause) - look for SELECT after WITH
  if (normalized.toUpperCase().startsWith('WITH ')) {
    const selectMatch = normalized.match(/\bSELECT\s/is);
    return selectMatch !== null;
  }

  // Check if the first meaningful keyword is SELECT
  // Handle "SELECT INTO" as read-only
  const upper = normalized.toUpperCase();
  return upper.startsWith('SELECT') || upper.startsWith('SELECT INTO');
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
  query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<T>>;

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
   */
  get<TName extends keyof TTables & string, TOptions extends TypedGetOptions<TTables[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<FindResult<
    EntryTable<TTables[TName]>,
    TOptions,
    EntryRelations<TTables[TName]>
  > | null>;

  /**
   * Get a single row or throw NotFoundError.
   */
  getOrThrow<
    TName extends keyof TTables & string,
    TOptions extends TypedGetOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;

  /**
   * List multiple rows.
   */
  list<TName extends keyof TTables & string, TOptions extends TypedListOptions<TTables[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[]>;

  /**
   * List multiple rows with total count.
   */
  listAndCount<
    TName extends keyof TTables & string,
    TOptions extends TypedListOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<{
    data: FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[];
    total: number;
  }>;

  /** @deprecated Use `get` instead */
  findOne: DatabaseInstance<TTables>['get'];
  /** @deprecated Use `getOrThrow` instead */
  findOneOrThrow: DatabaseInstance<TTables>['getOrThrow'];
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
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;

  /**
   * Insert multiple rows and return the count.
   */
  createMany<TName extends keyof TTables & string>(
    table: TName,
    options: TypedCreateManyOptions<TTables[TName]>,
  ): Promise<{ count: number }>;

  /**
   * Insert multiple rows and return them.
   */
  createManyAndReturn<
    TName extends keyof TTables & string,
    TOptions extends TypedCreateManyAndReturnOptions<TTables[TName]>,
  >(
    table: TName,
    options: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[]>;

  // -------------------------------------------------------------------------
  // Update queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Update matching rows and return the first. Throws NotFoundError if none match.
   */
  update<TName extends keyof TTables & string, TOptions extends TypedUpdateOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;

  /**
   * Update matching rows and return the count.
   */
  updateMany<TName extends keyof TTables & string>(
    table: TName,
    options: TypedUpdateManyOptions<TTables[TName]>,
  ): Promise<{ count: number }>;

  // -------------------------------------------------------------------------
  // Upsert (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert or update a row.
   */
  upsert<TName extends keyof TTables & string, TOptions extends TypedUpsertOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;

  // -------------------------------------------------------------------------
  // Delete queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Delete a matching row and return it. Throws NotFoundError if none match.
   */
  delete<TName extends keyof TTables & string, TOptions extends TypedDeleteOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;

  /**
   * Delete matching rows and return the count.
   */
  deleteMany<TName extends keyof TTables & string>(
    table: TName,
    options: TypedDeleteManyOptions<TTables[TName]>,
  ): Promise<{ count: number }>;

  // -------------------------------------------------------------------------
  // Aggregation queries (DB-012)
  // -------------------------------------------------------------------------

  /**
   * Count rows matching an optional filter.
   */
  count<TName extends keyof TTables & string>(
    table: TName,
    options?: TypedCountOptions<TTables[TName]>,
  ): Promise<number>;

  /**
   * Run aggregation functions on a table.
   */
  aggregate<TName extends keyof TTables & string>(
    table: TName,
    options: agg.AggregateArgs,
  ): Promise<Record<string, unknown>>;

  /**
   * Group rows by columns and apply aggregation functions.
   */
  groupBy<TName extends keyof TTables & string>(
    table: TName,
    options: agg.GroupByArgs,
  ): Promise<Record<string, unknown>[]>;
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

        // Route read queries to replicas with round-robin
        if (isReadQuery(sqlStr)) {
          const targetReplica = replicaDrivers[replicaIndex]!;
          replicaIndex = (replicaIndex + 1) % replicaDrivers.length;
          return targetReplica.queryFn<T>(sqlStr, params);
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

    async query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<T>> {
      return executeQuery<T>(queryFn, fragment.sql, fragment.params);
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
        return rows[0] ?? null;
      }
      return result;
    },

    async getOrThrow(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      const result = await crud.getOrThrow(queryFn, entry.table, opts as crud.GetArgs);
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
        return rows[0] as Record<string, unknown>;
      }
      return result;
    },

    async list(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      const results = await crud.list(queryFn, entry.table, opts as crud.ListArgs);
      if (opts?.include && results.length > 0) {
        return loadRelations(
          queryFn,
          results as Record<string, unknown>[],
          entry.relations as Record<string, RelationDef>,
          opts.include as IncludeSpec,
          0,
          tablesRegistry,
          entry.table,
        );
      }
      return results;
    },

    async listAndCount(name, opts): Promise<AnyResult> {
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

    async create(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.create(queryFn, entry.table, opts as crud.CreateArgs);
    },

    async createMany(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.createMany(queryFn, entry.table, opts as crud.CreateManyArgs);
    },

    async createManyAndReturn(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.createManyAndReturn(queryFn, entry.table, opts as crud.CreateManyAndReturnArgs);
    },

    // -----------------------------------------------------------------------
    // Update queries
    // -----------------------------------------------------------------------

    async update(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.update(queryFn, entry.table, opts as crud.UpdateArgs);
    },

    async updateMany(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.updateMany(queryFn, entry.table, opts as crud.UpdateManyArgs);
    },

    // -----------------------------------------------------------------------
    // Upsert
    // -----------------------------------------------------------------------

    async upsert(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.upsert(queryFn, entry.table, opts as crud.UpsertArgs);
    },

    // -----------------------------------------------------------------------
    // Delete queries
    // -----------------------------------------------------------------------

    async delete(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.deleteOne(queryFn, entry.table, opts as crud.DeleteArgs);
    },

    async deleteMany(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      return crud.deleteMany(queryFn, entry.table, opts as crud.DeleteManyArgs);
    },

    // -----------------------------------------------------------------------
    // Aggregation queries
    // -----------------------------------------------------------------------

    async count(name, opts) {
      const entry = resolveTable(tables, name);
      return agg.count(queryFn, entry.table, opts as { where?: Record<string, unknown> });
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
