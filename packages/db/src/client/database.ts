import { err, ok, type Result } from '@vertz/schema';
import { type Dialect, defaultPostgresDialect, defaultSqliteDialect } from '../dialect';
import { type ReadError, toReadError, toWriteError, type WriteError } from '../errors';
import * as agg from '../query/aggregate';
import * as crud from '../query/crud';
import { executeQuery, type QueryFn } from '../query/executor';
import { type IncludeSpec, loadRelations, type TableRegistryEntry } from '../query/relation-loader';
import type {
  FilterType,
  FindResult,
  IncludeOption,
  InsertInput,
  ModelEntry,
  OrderByType,
  SelectOption,
  UpdateInput,
} from '../schema/inference';
import type { RelationDef } from '../schema/relation';
import type { SqlFragment } from '../sql/tagged';
import { createPostgresDriver, type PostgresDriver } from './postgres-driver';
import {
  buildTableSchema,
  createSqliteDriver,
  type D1Database,
  type SqliteDriver,
} from './sqlite-driver';
import { computeTenantGraph, type TenantGraph } from './tenant-graph';

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

export interface CreateDbOptions<TModels extends Record<string, ModelEntry>> {
  /** Model registry mapping logical names to table definitions + relations. */
  readonly models: TModels;
  /** Database dialect to use. Defaults to 'postgres' if not specified. */
  readonly dialect?: 'postgres' | 'sqlite';
  /** D1 database binding (required when dialect is 'sqlite'). */
  readonly d1?: D1Database;
  /** PostgreSQL connection URL. */
  readonly url?: string;
  /** Connection pool configuration. */
  readonly pool?: PoolConfig;
  /** Column name casing strategy. */
  readonly casing?: 'snake_case' | 'camelCase';
  /**
   * Custom casing overrides for edge cases (e.g., OAuth, ID).
   * Maps camelCase keys to snake_case column names.
   * These overrides run BEFORE auto-casing logic.
   * Example: { 'oAuthToken': 'oauth_token', 'userID': 'user_id' }
   */
  readonly casingOverrides?: Record<string, string>;
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
// Type helpers — extract table/relations from TModels entry
// ---------------------------------------------------------------------------

/** Extract the TableDef from a ModelEntry. */
type EntryTable<TEntry extends ModelEntry> = TEntry['table'];

/** Extract the relations record from a ModelEntry. */
type EntryRelations<TEntry extends ModelEntry> = TEntry['relations'];

/** Extract columns from a ModelEntry's table. */
type EntryColumns<TEntry extends ModelEntry> = EntryTable<TEntry>['_columns'];

// ---------------------------------------------------------------------------
// Typed query option types
// ---------------------------------------------------------------------------

/** Options for get / getOrThrow — typed per-table. */
type TypedGetOptions<TEntry extends ModelEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly include?: IncludeOption<EntryRelations<TEntry>>;
};

/** Options for list / listAndCount — typed per-table. */
type TypedListOptions<TEntry extends ModelEntry> = {
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
type TypedCreateOptions<TEntry extends ModelEntry> = {
  readonly data: InsertInput<EntryTable<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for createManyAndReturn — typed per-table. */
type TypedCreateManyAndReturnOptions<TEntry extends ModelEntry> = {
  readonly data: readonly InsertInput<EntryTable<TEntry>>[];
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for createMany — typed per-table. */
type TypedCreateManyOptions<TEntry extends ModelEntry> = {
  readonly data: readonly InsertInput<EntryTable<TEntry>>[];
};

/** Options for update — typed per-table. */
type TypedUpdateOptions<TEntry extends ModelEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly data: UpdateInput<EntryTable<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for updateMany — typed per-table. */
type TypedUpdateManyOptions<TEntry extends ModelEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly data: UpdateInput<EntryTable<TEntry>>;
};

/** Options for upsert — typed per-table. */
type TypedUpsertOptions<TEntry extends ModelEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly create: InsertInput<EntryTable<TEntry>>;
  readonly update: UpdateInput<EntryTable<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for delete — typed per-table. */
type TypedDeleteOptions<TEntry extends ModelEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
};

/** Options for deleteMany — typed per-table. */
type TypedDeleteManyOptions<TEntry extends ModelEntry> = {
  readonly where: FilterType<EntryColumns<TEntry>>;
};

/** Options for count — typed per-table. */
type TypedCountOptions<TEntry extends ModelEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
};

// ---------------------------------------------------------------------------
// Database instance interface — unified type (resolves follow-up #8)
// ---------------------------------------------------------------------------

export interface DatabaseInstance<TModels extends Record<string, ModelEntry>> {
  /** The model registry for type-safe access. */
  readonly _models: TModels;
  /** The SQL dialect used by this database instance. */
  readonly _dialect: Dialect;
  /** The computed tenant scoping graph. */
  readonly $tenantGraph: TenantGraph;

  /**
   * Execute a raw SQL query via the sql tagged template.
   */
  query<T = Record<string, unknown>>(
    fragment: SqlFragment,
  ): Promise<Result<QueryResult<T>, ReadError>>;

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
  get<TName extends keyof TModels & string, TOptions extends TypedGetOptions<TModels[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>> | null,
      ReadError
    >
  >;

  /**
   * Get a single row or return NotFoundError.
   * Use when absence of a record is an error condition.
   */
  getRequired<
    TName extends keyof TModels & string,
    TOptions extends TypedGetOptions<TModels[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>,
      ReadError
    >
  >;

  /**
   * Get a single row or throw NotFoundError.
   * Alias for getRequired.
   */
  getOrThrow<
    TName extends keyof TModels & string,
    TOptions extends TypedGetOptions<TModels[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>,
      ReadError
    >
  >;

  /**
   * List multiple rows.
   */
  list<TName extends keyof TModels & string, TOptions extends TypedListOptions<TModels[TName]>>(
    table: TName,
    options?: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>[],
      ReadError
    >
  >;

  /**
   * List multiple rows with total count.
   */
  listAndCount<
    TName extends keyof TModels & string,
    TOptions extends TypedListOptions<TModels[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<
    Result<
      {
        data: FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>[];
        total: number;
      },
      ReadError
    >
  >;

  /** @deprecated Use `get` instead */
  findOne: DatabaseInstance<TModels>['get'];
  /** @deprecated Use `getRequired` instead */
  findOneRequired: DatabaseInstance<TModels>['getRequired'];
  /** @deprecated Use `getOrThrow` instead */
  findOneOrThrow: DatabaseInstance<TModels>['getOrThrow'];
  /** @deprecated Use `list` instead */
  findMany: DatabaseInstance<TModels>['list'];
  /** @deprecated Use `listAndCount` instead */
  findManyAndCount: DatabaseInstance<TModels>['listAndCount'];

  // -------------------------------------------------------------------------
  // Create queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert a single row and return it.
   */
  create<TName extends keyof TModels & string, TOptions extends TypedCreateOptions<TModels[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>,
      WriteError
    >
  >;

  /**
   * Insert multiple rows and return the count.
   */
  createMany<TName extends keyof TModels & string>(
    table: TName,
    options: TypedCreateManyOptions<TModels[TName]>,
  ): Promise<Result<{ count: number }, WriteError>>;

  /**
   * Insert multiple rows and return them.
   */
  createManyAndReturn<
    TName extends keyof TModels & string,
    TOptions extends TypedCreateManyAndReturnOptions<TModels[TName]>,
  >(
    table: TName,
    options: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>[],
      WriteError
    >
  >;

  // -------------------------------------------------------------------------
  // Update queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Update matching rows and return the first.
   * Returns NotFoundError if no rows match.
   */
  update<TName extends keyof TModels & string, TOptions extends TypedUpdateOptions<TModels[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>,
      WriteError
    >
  >;

  /**
   * Update matching rows and return the count.
   */
  updateMany<TName extends keyof TModels & string>(
    table: TName,
    options: TypedUpdateManyOptions<TModels[TName]>,
  ): Promise<Result<{ count: number }, WriteError>>;

  // -------------------------------------------------------------------------
  // Upsert (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert or update a row.
   */
  upsert<TName extends keyof TModels & string, TOptions extends TypedUpsertOptions<TModels[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>,
      WriteError
    >
  >;

  // -------------------------------------------------------------------------
  // Delete queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Delete a matching row and return it.
   * Returns NotFoundError if no rows match.
   */
  delete<TName extends keyof TModels & string, TOptions extends TypedDeleteOptions<TModels[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TModels[TName]>, TOptions, EntryRelations<TModels[TName]>>,
      WriteError
    >
  >;

  /**
   * Delete matching rows and return the count.
   */
  deleteMany<TName extends keyof TModels & string>(
    table: TName,
    options: TypedDeleteManyOptions<TModels[TName]>,
  ): Promise<Result<{ count: number }, WriteError>>;

  // -------------------------------------------------------------------------
  // Aggregation queries (DB-012)
  // -------------------------------------------------------------------------

  /**
   * Count rows matching an optional filter.
   */
  count<TName extends keyof TModels & string>(
    table: TName,
    options?: TypedCountOptions<TModels[TName]>,
  ): Promise<Result<number, ReadError>>;

  /**
   * Run aggregation functions on a table.
   */
  aggregate<TName extends keyof TModels & string>(
    table: TName,
    options: agg.AggregateArgs,
  ): Promise<Result<Record<string, unknown>, ReadError>>;

  /**
   * Group rows by columns and apply aggregation functions.
   */
  groupBy<TName extends keyof TModels & string>(
    table: TName,
    options: agg.GroupByArgs,
  ): Promise<Result<Record<string, unknown>[], ReadError>>;
}

// ---------------------------------------------------------------------------
// Resolve model entry helper
// ---------------------------------------------------------------------------

function resolveModel<TModels extends Record<string, ModelEntry>>(
  models: TModels,
  name: string,
): ModelEntry {
  const entry = models[name];
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
export function createDb<TModels extends Record<string, ModelEntry>>(
  options: CreateDbOptions<TModels>,
): DatabaseInstance<TModels> {
  const { models, log, dialect } = options;

  // Validate dialect-specific options
  if (dialect === 'sqlite') {
    if (!options.d1) {
      throw new Error('SQLite dialect requires a D1 binding');
    }
    if (options.url) {
      throw new Error('SQLite dialect uses D1, not a connection URL');
    }
  }

  // Create the dialect object based on the dialect option
  const dialectObj: Dialect = dialect === 'sqlite' ? defaultSqliteDialect : defaultPostgresDialect;

  // Compute tenant graph from model registry metadata
  const tenantGraph = computeTenantGraph(models);

  // Log notices for unscoped tables
  if (log && tenantGraph.root !== null) {
    const allScoped = new Set<string>([
      ...(tenantGraph.root !== null ? [tenantGraph.root] : []),
      ...tenantGraph.directlyScoped,
      ...tenantGraph.indirectlyScoped,
      ...tenantGraph.shared,
    ]);

    for (const [key, entry] of Object.entries(models)) {
      if (!allScoped.has(key)) {
        log(
          `[vertz/db] Table "${entry.table._name}" has no tenant path and is not marked .shared(). ` +
            'It will not be automatically scoped to a tenant.',
        );
      }
    }
  }

  // Pre-compute the model registry for relation loading
  // ModelEntry is structurally compatible with TableRegistryEntry
  const modelsRegistry = models as Record<string, TableRegistryEntry>;

  // Create the postgres driver if _queryFn is not provided
  let driver: PostgresDriver | null = null;
  let sqliteDriver: SqliteDriver | null = null;
  let replicaDrivers: PostgresDriver[] = [];
  let replicaIndex = 0;

  const queryFn: QueryFn = (() => {
    // If _queryFn is explicitly provided (e.g., PGlite for testing), use it
    if (options._queryFn) {
      return options._queryFn;
    }

    // Handle SQLite dialect
    if (dialect === 'sqlite' && options.d1) {
      // Build table schema registry for value conversion
      const tableSchema = buildTableSchema(models);
      sqliteDriver = createSqliteDriver(options.d1, tableSchema);

      // Return a query function that wraps the SQLite driver
      // SQLite driver returns rows[], but QueryFn expects { rows, rowCount }
      return async <T>(sqlStr: string, params: readonly unknown[]) => {
        if (!sqliteDriver) {
          throw new Error('SQLite driver not initialized');
        }
        const rows = await sqliteDriver.query<T>(sqlStr, params as unknown[]);
        return { rows, rowCount: rows.length };
      };
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
      return async <T>(sqlStr: string, params: readonly unknown[]) => {
        // If no replicas configured, always use primary
        if (replicaDrivers.length === 0) {
          if (!driver) {
            throw new Error('Database driver not initialized');
          }
          return driver.queryFn<T>(sqlStr, params);
        }

        // Route read queries to replicas with round-robin and fallback on failure
        if (isReadQuery(sqlStr)) {
          const targetReplica = replicaDrivers[replicaIndex]!;
          replicaIndex = (replicaIndex + 1) % replicaDrivers.length;
          try {
            return await targetReplica.queryFn<T>(sqlStr, params);
          } catch (err) {
            // Replica failed, fall back to primary
            console.warn(
              '[vertz/db] replica query failed, falling back to primary:',
              (err as Error).message,
            );
          }
        }

        // Write queries always go to primary
        if (!driver) {
          throw new Error('Database driver not initialized');
        }
        return driver.queryFn<T>(sqlStr, params);
      };
    }

    // Fallback: no driver, no _queryFn — throw on query
    return (async () => {
      throw new Error(
        'db.query() requires a connected database driver. ' +
          'Provide a `url` to connect to PostgreSQL, a `dialect` with D1 binding for SQLite, or `_queryFn` for testing.',
      );
    }) as QueryFn;
  })();

  // -----------------------------------------------------------------------
  // Implementation note: The interface provides fully typed signatures.
  // Internally, the CRUD functions use Record<string, unknown> at runtime.
  // We use `as any` on the return type to bridge the gap — the external
  // contract (DatabaseInstance<TModels>) ensures type safety for callers.
  // -----------------------------------------------------------------------

  // biome-ignore lint/suspicious/noExplicitAny: Internal implementation bridges typed interface to untyped CRUD layer
  type AnyResult = any;

  return {
    _models: models,
    _dialect: dialectObj,
    $tenantGraph: tenantGraph,

    async query<T = Record<string, unknown>>(
      fragment: SqlFragment,
    ): Promise<Result<QueryResult<T>, ReadError>> {
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
      // Close SQLite driver
      if (sqliteDriver) {
        await sqliteDriver.close();
      }
      // Close all replica drivers
      await Promise.all(replicaDrivers.map((r) => r.close()));
    },

    async isHealthy(): Promise<boolean> {
      if (driver) {
        return driver.isHealthy();
      }
      if (sqliteDriver) {
        return sqliteDriver.isHealthy();
      }
      // When using _queryFn (PGlite), assume healthy
      return true;
    },

    // -----------------------------------------------------------------------
    // Query methods
    // -----------------------------------------------------------------------

    async get(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.get(queryFn, entry.table, opts as crud.GetArgs, dialectObj);
        if (result !== null && opts?.include) {
          const rows = await loadRelations(
            queryFn,
            [result as Record<string, unknown>],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            modelsRegistry,
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
        const entry = resolveModel(models, name);
        const result = await crud.get(queryFn, entry.table, opts as crud.GetArgs, dialectObj);
        if (result === null) {
          return err({
            code: 'NOT_FOUND' as const,
            message: `Record not found in table ${name}`,
            table: name,
          });
        }
        if (opts?.include) {
          const rows = await loadRelations(
            queryFn,
            [result as Record<string, unknown>],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            modelsRegistry,
            entry.table,
          );
          return ok(rows[0] as Record<string, unknown>);
        }
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async getOrThrow(name, opts): Promise<AnyResult> {
      return this.getRequired(name, opts);
    },

    async list(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const results = await crud.list(queryFn, entry.table, opts as crud.ListArgs, dialectObj);
        if (opts?.include && results.length > 0) {
          const withRelations = await loadRelations(
            queryFn,
            results as Record<string, unknown>[],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            modelsRegistry,
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
        const entry = resolveModel(models, name);
        const { data, total } = await crud.listAndCount(
          queryFn,
          entry.table,
          opts as crud.ListArgs,
          dialectObj,
        );
        if (opts?.include && data.length > 0) {
          const withRelations = await loadRelations(
            queryFn,
            data as Record<string, unknown>[],
            entry.relations as Record<string, RelationDef>,
            opts.include as IncludeSpec,
            0,
            modelsRegistry,
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
      try {
        const entry = resolveModel(models, name);
        const result = await crud.create(queryFn, entry.table, opts as crud.CreateArgs, dialectObj);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async createMany(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.createMany(
          queryFn,
          entry.table,
          opts as crud.CreateManyArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async createManyAndReturn(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.createManyAndReturn(
          queryFn,
          entry.table,
          opts as crud.CreateManyAndReturnArgs,
          dialectObj,
        );
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
        const entry = resolveModel(models, name);
        const result = await crud.update(queryFn, entry.table, opts as crud.UpdateArgs, dialectObj);
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async updateMany(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.updateMany(
          queryFn,
          entry.table,
          opts as crud.UpdateManyArgs,
          dialectObj,
        );
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
        const entry = resolveModel(models, name);
        const result = await crud.upsert(queryFn, entry.table, opts as crud.UpsertArgs, dialectObj);
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
        const entry = resolveModel(models, name);
        const result = await crud.deleteOne(
          queryFn,
          entry.table,
          opts as crud.DeleteArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    },

    async deleteMany(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.deleteMany(
          queryFn,
          entry.table,
          opts as crud.DeleteManyArgs,
          dialectObj,
        );
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
        const entry = resolveModel(models, name);
        const result = await agg.count(
          queryFn,
          entry.table,
          opts as { where?: Record<string, unknown> },
        );
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async aggregate(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await agg.aggregate(queryFn, entry.table, opts);
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },

    async groupBy(name, opts): Promise<AnyResult> {
      try {
        const entry = resolveModel(models, name);
        const result = await agg.groupBy(queryFn, entry.table, opts);
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    },
  };
}
