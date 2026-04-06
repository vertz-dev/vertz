import { err, ok, type Result } from '@vertz/schema';
import { type Dialect, defaultPostgresDialect, defaultSqliteDialect } from '../dialect';
import { type ReadError, toReadError, toWriteError, type WriteError } from '../errors';
import * as agg from '../query/aggregate';
import * as crud from '../query/crud';
import { executeQuery, type QueryFn } from '../query/executor';
import { type IncludeSpec, loadRelations, type TableRegistryEntry } from '../query/relation-loader';
import type { ColumnMetadata } from '../schema/column';
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
import type { PostgresDriver } from './postgres-driver';
import {
  buildTableSchema,
  createLocalSqliteDriver,
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

/** Common options shared by all dialect variants. */
interface CreateDbBaseOptions<TModels extends Record<string, ModelEntry>> {
  /** Model registry mapping logical names to table definitions + relations. */
  readonly models: TModels;
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

/** Options for PostgreSQL dialect (default). */
interface CreateDbPostgresOptions<
  TModels extends Record<string, ModelEntry>,
> extends CreateDbBaseOptions<TModels> {
  readonly dialect?: 'postgres';
  /** PostgreSQL connection URL. */
  readonly url?: string;
  /** Connection pool configuration. */
  readonly pool?: PoolConfig;
  readonly d1?: never;
  readonly path?: never;
  readonly migrations?: never;
}

/** Options for SQLite dialect with local file path. */
interface CreateDbSqlitePathOptions<
  TModels extends Record<string, ModelEntry>,
> extends CreateDbBaseOptions<TModels> {
  readonly dialect: 'sqlite';
  /** Path to SQLite database file, or ':memory:' for in-memory. */
  readonly path: string;
  /** Auto-apply migrations (CREATE TABLE IF NOT EXISTS) on startup. */
  readonly migrations?: { readonly autoApply?: boolean };
  readonly d1?: never;
  readonly url?: never;
  readonly pool?: never;
}

/** Options for SQLite dialect with Cloudflare D1 binding. */
interface CreateDbSqliteD1Options<
  TModels extends Record<string, ModelEntry>,
> extends CreateDbBaseOptions<TModels> {
  readonly dialect: 'sqlite';
  /** D1 database binding (Cloudflare Workers). */
  readonly d1: D1Database;
  readonly path?: never;
  readonly url?: never;
  readonly pool?: never;
  readonly migrations?: never;
}

export type CreateDbOptions<TModels extends Record<string, ModelEntry>> =
  | CreateDbPostgresOptions<TModels>
  | CreateDbSqlitePathOptions<TModels>
  | CreateDbSqliteD1Options<TModels>;

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
type TypedGetOptions<
  TEntry extends ModelEntry,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly include?: IncludeOption<EntryRelations<TEntry>, TModels>;
};

/** Options for list / listAndCount — typed per-table. */
type TypedListOptions<
  TEntry extends ModelEntry,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly limit?: number;
  readonly offset?: number;
  /** Cursor object: column-value pairs marking the position to paginate from. */
  readonly cursor?: Record<string, unknown>;
  /** Number of rows to take (used with cursor). Aliases `limit` when cursor is present. */
  readonly take?: number;
  readonly include?: IncludeOption<EntryRelations<TEntry>, TModels>;
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
// Model delegate — the object you get from db.users, db.posts, etc.
// Carries all CRUD methods typed for a specific model entry.
// ---------------------------------------------------------------------------

export interface ModelDelegate<
  TEntry extends ModelEntry,
  TModels extends Record<string, ModelEntry> = Record<string, ModelEntry>,
> {
  /** Get a single row or null. */
  get<TOptions extends TypedGetOptions<TEntry, TModels>>(
    options?: TOptions,
  ): Promise<
    Result<
      FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels> | null,
      ReadError
    >
  >;

  /** Get a single row or return NotFoundError. */
  getOrThrow<TOptions extends TypedGetOptions<TEntry, TModels>>(
    options?: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>, ReadError>
  >;

  /** List multiple rows. */
  list<TOptions extends TypedListOptions<TEntry, TModels>>(
    options?: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>[], ReadError>
  >;

  /** List multiple rows with total count. */
  listAndCount<TOptions extends TypedListOptions<TEntry, TModels>>(
    options?: TOptions,
  ): Promise<
    Result<
      {
        data: FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>[];
        total: number;
      },
      ReadError
    >
  >;

  /** Insert a single row and return it. */
  create<TOptions extends TypedCreateOptions<TEntry>>(
    options: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>, WriteError>
  >;

  /** Insert multiple rows and return the count. */
  createMany(
    options: TypedCreateManyOptions<TEntry>,
  ): Promise<Result<{ count: number }, WriteError>>;

  /** Insert multiple rows and return them. */
  createManyAndReturn<TOptions extends TypedCreateManyAndReturnOptions<TEntry>>(
    options: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>[], WriteError>
  >;

  /** Update matching rows and return the first. */
  update<TOptions extends TypedUpdateOptions<TEntry>>(
    options: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>, WriteError>
  >;

  /** Update matching rows and return the count. */
  updateMany(
    options: TypedUpdateManyOptions<TEntry>,
  ): Promise<Result<{ count: number }, WriteError>>;

  /** Insert or update a row. */
  upsert<TOptions extends TypedUpsertOptions<TEntry>>(
    options: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>, WriteError>
  >;

  /** Delete a matching row and return it. */
  delete<TOptions extends TypedDeleteOptions<TEntry>>(
    options: TOptions,
  ): Promise<
    Result<FindResult<EntryTable<TEntry>, TOptions, EntryRelations<TEntry>, TModels>, WriteError>
  >;

  /** Delete matching rows and return the count. */
  deleteMany(
    options: TypedDeleteManyOptions<TEntry>,
  ): Promise<Result<{ count: number }, WriteError>>;

  /** Count rows matching an optional filter. */
  count(options?: TypedCountOptions<TEntry>): Promise<Result<number, ReadError>>;

  /** Run aggregation functions on a table. */
  aggregate<TArgs extends agg.TypedAggregateArgs<TEntry>>(
    options: TArgs,
  ): Promise<Result<agg.AggregateResult<EntryColumns<TEntry>, TArgs>, ReadError>>;

  /** Group rows by columns and apply aggregation functions. */
  groupBy<TArgs extends agg.TypedGroupByArgs<TEntry>>(
    options: TArgs,
  ): Promise<Result<agg.GroupByResult<EntryColumns<TEntry>, TArgs>[], ReadError>>;
}

// ---------------------------------------------------------------------------
// Database internals — grouped under _internals
// ---------------------------------------------------------------------------

export interface DatabaseInternals<TModels extends Record<string, ModelEntry>> {
  /** The model registry. */
  readonly models: TModels;
  /** The SQL dialect used by this database instance. */
  readonly dialect: Dialect;
  /** The computed tenant scoping graph. */
  readonly tenantGraph: TenantGraph;
}

// ---------------------------------------------------------------------------
// TransactionClient — scoped client for use within a transaction callback.
// Same model delegates and raw query as DatabaseClient, but all operations
// execute within a single atomic transaction.
// ---------------------------------------------------------------------------

/**
 * Scoped client for use within a transaction callback.
 * Provides the same model delegates and raw query as DatabaseClient —
 * all operations execute within a single atomic transaction.
 *
 * Auto-commits on success, auto-rolls-back on error.
 */
export type TransactionClient<TModels extends Record<string, ModelEntry>> = {
  readonly [K in keyof TModels]: ModelDelegate<TModels[K], TModels>;
} & {
  /** Execute a raw SQL query within the transaction. */
  query<T = Record<string, unknown>>(
    fragment: SqlFragment,
  ): Promise<Result<QueryResult<T>, ReadError>>;
};

// ---------------------------------------------------------------------------
// DatabaseClient — Prisma-style API: db.users.create(), db.posts.list(), etc.
// Model delegates are mapped from the models registry keys.
// ---------------------------------------------------------------------------

export type DatabaseClient<TModels extends Record<string, ModelEntry>> = {
  readonly [K in keyof TModels]: ModelDelegate<TModels[K], TModels>;
} & {
  /** Execute a raw SQL query via the sql tagged template. */
  query<T = Record<string, unknown>>(
    fragment: SqlFragment,
  ): Promise<Result<QueryResult<T>, ReadError>>;

  /**
   * Execute a callback within a database transaction.
   * All operations on the `tx` client are atomic — auto-commits on success,
   * auto-rolls-back if the callback throws.
   */
  transaction<T>(fn: (tx: TransactionClient<TModels>) => Promise<T>): Promise<T>;

  /** Close all pool connections. */
  close(): Promise<void>;

  /** Check if the database connection is healthy. */
  isHealthy(): Promise<boolean>;

  /** Internal properties — not part of the public API. */
  readonly _internals: DatabaseInternals<TModels>;
};

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
// Reserved model names — collide with top-level DatabaseClient methods
// ---------------------------------------------------------------------------

const RESERVED_MODEL_NAMES = new Set(['query', 'transaction', 'close', 'isHealthy', '_internals']);

// ---------------------------------------------------------------------------
// buildDelegates — creates model delegates for a given queryFn
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Internal — delegates are typed externally via DatabaseClient/TransactionClient
type AnyResult = any;

/**
 * Build model delegates (get, list, create, update, delete, etc.) for each
 * model in the registry, using the provided queryFn for all SQL execution.
 *
 * This is called once for the top-level DatabaseClient (with the main queryFn)
 * and again inside transaction() with a transaction-scoped queryFn.
 */
function buildDelegates<TModels extends Record<string, ModelEntry>>(
  qfn: QueryFn,
  models: TModels,
  dialectObj: Dialect,
  modelsRegistry: Record<string, TableRegistryEntry>,
): Record<string, ModelDelegate<ModelEntry>> {
  function implGet(name: string, opts?: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.get(qfn, entry.table, opts as crud.GetArgs, dialectObj);
        if (result !== null && opts?.include) {
          const rows = await loadRelations(
            qfn,
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
    })();
  }

  function implGetRequired(name: string, opts?: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.get(qfn, entry.table, opts as crud.GetArgs, dialectObj);
        if (result === null) {
          return err({
            code: 'NotFound' as const,
            message: `Record not found in table ${name}`,
            table: name,
          });
        }
        if (opts?.include) {
          const rows = await loadRelations(
            qfn,
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
    })();
  }

  function implList(name: string, opts?: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const results = await crud.list(qfn, entry.table, opts as crud.ListArgs, dialectObj);
        if (opts?.include && results.length > 0) {
          const withRelations = await loadRelations(
            qfn,
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
    })();
  }

  function implListAndCount(name: string, opts?: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const { data, total } = await crud.listAndCount(
          qfn,
          entry.table,
          opts as crud.ListArgs,
          dialectObj,
        );
        if (opts?.include && data.length > 0) {
          const withRelations = await loadRelations(
            qfn,
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
    })();
  }

  function implCreate(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.create(
          qfn,
          entry.table,
          opts as unknown as crud.CreateArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implCreateMany(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.createMany(
          qfn,
          entry.table,
          opts as unknown as crud.CreateManyArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implCreateManyAndReturn(
    name: string,
    opts: Record<string, unknown>,
  ): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.createManyAndReturn(
          qfn,
          entry.table,
          opts as unknown as crud.CreateManyAndReturnArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implUpdate(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.update(
          qfn,
          entry.table,
          opts as unknown as crud.UpdateArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implUpdateMany(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.updateMany(
          qfn,
          entry.table,
          opts as unknown as crud.UpdateManyArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implUpsert(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.upsert(
          qfn,
          entry.table,
          opts as unknown as crud.UpsertArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implDelete(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.deleteOne(
          qfn,
          entry.table,
          opts as unknown as crud.DeleteArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implDeleteMany(name: string, opts: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await crud.deleteMany(
          qfn,
          entry.table,
          opts as unknown as crud.DeleteManyArgs,
          dialectObj,
        );
        return ok(result);
      } catch (e) {
        return err(toWriteError(e));
      }
    })();
  }

  function implCount(name: string, opts?: Record<string, unknown>): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await agg.count(
          qfn,
          entry.table,
          opts as { where?: Record<string, unknown> },
        );
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    })();
  }

  function implAggregate(name: string, opts: agg.AggregateArgs): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await agg.aggregate(qfn, entry.table, opts);
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    })();
  }

  function implGroupBy(name: string, opts: agg.GroupByArgs): Promise<AnyResult> {
    return (async () => {
      try {
        const entry = resolveModel(models, name);
        const result = await agg.groupBy(qfn, entry.table, opts, dialectObj);
        return ok(result);
      } catch (e) {
        return err(toReadError(e));
      }
    })();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Delegates are typed externally via DatabaseClient<TModels>
  const delegates: Record<string, any> = {};

  for (const name of Object.keys(models)) {
    delegates[name] = {
      get: (opts?: Record<string, unknown>) => implGet(name, opts),
      getOrThrow: (opts?: Record<string, unknown>) => implGetRequired(name, opts),
      list: (opts?: Record<string, unknown>) => implList(name, opts),
      listAndCount: (opts?: Record<string, unknown>) => implListAndCount(name, opts),
      create: (opts: Record<string, unknown>) => implCreate(name, opts),
      createMany: (opts: Record<string, unknown>) => implCreateMany(name, opts),
      createManyAndReturn: (opts: Record<string, unknown>) => implCreateManyAndReturn(name, opts),
      update: (opts: Record<string, unknown>) => implUpdate(name, opts),
      updateMany: (opts: Record<string, unknown>) => implUpdateMany(name, opts),
      upsert: (opts: Record<string, unknown>) => implUpsert(name, opts),
      delete: (opts: Record<string, unknown>) => implDelete(name, opts),
      deleteMany: (opts: Record<string, unknown>) => implDeleteMany(name, opts),
      count: (opts?: Record<string, unknown>) => implCount(name, opts),
      aggregate: (opts: agg.AggregateArgs) => implAggregate(name, opts),
      groupBy: (opts: agg.GroupByArgs) => implGroupBy(name, opts),
    };
  }

  return delegates as Record<string, ModelDelegate<ModelEntry>>;
}

/**
 * Build a query method that wraps a QueryFn with Result error handling.
 */
function buildQueryMethod(qfn: QueryFn) {
  return async <T = Record<string, unknown>>(
    fragment: SqlFragment,
  ): Promise<Result<QueryResult<T>, ReadError>> => {
    try {
      const result = await executeQuery<T>(qfn, fragment.sql, fragment.params);
      return ok(result);
    } catch (e) {
      return err(toReadError(e, fragment.sql));
    }
  };
}

// ---------------------------------------------------------------------------
// createDb — factory function
// ---------------------------------------------------------------------------

/**
 * Creates a typed database client with Prisma-style model delegates.
 *
 * Instead of `db.get('users', opts)`, use `db.users.get(opts)`.
 * Each model in the registry becomes a property on the returned client
 * with all CRUD methods typed for that specific model.
 *
 * Computes the tenant graph at creation time from model-level { tenant }
 * options, traversing relations to find indirect tenant paths.
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
): DatabaseClient<TModels> {
  const { models, log, dialect } = options;

  // Validate reserved model names
  for (const key of Object.keys(models)) {
    if (RESERVED_MODEL_NAMES.has(key)) {
      throw new Error(
        `Model name "${key}" is reserved. Choose a different name for this model. ` +
          `Reserved names: ${[...RESERVED_MODEL_NAMES].join(', ')}`,
      );
    }
  }

  // Validate dialect-specific options
  const hasPath = 'path' in options && options.path;
  if (hasPath && dialect !== 'sqlite') {
    throw new Error('"path" is only valid with dialect: "sqlite"');
  }
  if (dialect === 'sqlite') {
    if (options.url) {
      throw new Error(
        'SQLite dialect uses "path" (local file) or "d1" (D1 binding) — "url" is for postgres',
      );
    }
    if (options.d1 && hasPath) {
      throw new Error('Cannot use both "path" and "d1" — pick one SQLite backend');
    }
    if (!options.d1 && !hasPath) {
      throw new Error(
        'SQLite dialect requires either a "path" (local file) or "d1" (Cloudflare D1 binding)',
      );
    }
  }

  // Create the dialect object based on the dialect option
  const dialectObj: Dialect = dialect === 'sqlite' ? defaultSqliteDialect : defaultPostgresDialect;

  // Compute tenant graph from model registry metadata
  const tenantGraph = computeTenantGraph(models);

  // Log notices for unscoped tables
  if (log && tenantGraph.root !== null) {
    const levels = tenantGraph.levels ?? [];
    const allScoped = new Set<string>([
      ...levels.map((l) => l.key),
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
  // Lazy postgres initialization — hoisted so transaction() can call it
  let initPostgres: (() => Promise<void>) | null = null;

  const queryFn: QueryFn = (() => {
    // If _queryFn is explicitly provided (e.g., PGlite for testing), use it
    if (options._queryFn) {
      return options._queryFn;
    }

    // Handle SQLite dialect with D1 binding
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

    // Handle SQLite dialect with local file path
    if (dialect === 'sqlite' && hasPath) {
      const sqlitePathOpts = options as CreateDbSqlitePathOptions<TModels>;
      const tableSchema = buildTableSchema(models);

      // Lazy driver init — created on first query (async import avoids Workers crash)
      let driverPromise: Promise<SqliteDriver> | null = null;
      const ensureDriver = async () => {
        if (sqliteDriver) return sqliteDriver;
        if (!driverPromise) {
          driverPromise = createLocalSqliteDriver(sqlitePathOpts.path, tableSchema).then((d) => {
            sqliteDriver = d;
            return d;
          });
        }
        return driverPromise;
      };

      // Lazy migration init — runs CREATE TABLE IF NOT EXISTS before first query
      let migrationDone = !sqlitePathOpts.migrations?.autoApply;
      let migrationPromise: Promise<void> | null = null;

      const ensureMigrated = async () => {
        if (migrationDone) return;
        if (migrationPromise) return migrationPromise;
        migrationPromise = (async () => {
          const { camelToSnake } = await import('../sql/casing');
          for (const entry of Object.values(models)) {
            const table = entry.table;
            const cols: string[] = [];
            for (const [colName, colBuilder] of Object.entries(table._columns)) {
              const meta = (colBuilder as { _meta: ColumnMetadata })._meta;
              const snakeName = camelToSnake(colName);
              const sqlType = dialectObj.mapColumnType(meta.sqlType, {
                ...(meta.dimensions != null && { dimensions: meta.dimensions }),
                ...(meta.length != null && { length: meta.length }),
                ...(meta.precision != null && { precision: meta.precision }),
                ...(meta.scale != null && { scale: meta.scale }),
              });
              let def = `"${snakeName}" ${sqlType}`;
              if (meta.primary) def += ' PRIMARY KEY';
              if (meta.unique && !meta.primary) def += ' UNIQUE';
              if (!meta.nullable && !meta.primary) def += ' NOT NULL';
              if (meta.hasDefault && meta.defaultValue !== undefined) {
                if (meta.defaultValue === 'now') def += ` DEFAULT (${dialectObj.now()})`;
                else if (typeof meta.defaultValue === 'string')
                  def += ` DEFAULT '${meta.defaultValue.replace(/'/g, "''")}'`;
                else if (typeof meta.defaultValue === 'number')
                  def += ` DEFAULT ${meta.defaultValue}`;
                else if (typeof meta.defaultValue === 'boolean')
                  def += ` DEFAULT ${meta.defaultValue ? 1 : 0}`;
              } else if (meta.isAutoUpdate) {
                // autoUpdate timestamps need a DEFAULT for the initial INSERT
                def += ` DEFAULT (${dialectObj.now()})`;
              }
              cols.push(def);
            }
            const ddl = `CREATE TABLE IF NOT EXISTS "${table._name}" (\n  ${cols.join(',\n  ')}\n)`;
            await sqliteDriver!.execute(ddl);
          }
          migrationDone = true;
        })();
        return migrationPromise;
      };

      return async <T>(sqlStr: string, params: readonly unknown[]) => {
        const driver = await ensureDriver();
        await ensureMigrated();
        const rows = await driver.query<T>(sqlStr, params as unknown[]);
        return { rows, rowCount: rows.length };
      };
    }

    // Otherwise, create a real postgres driver from the URL.
    // The driver is initialized lazily on the first query to avoid pulling
    // the postgres package into the main bundle at module load time —
    // Cloudflare Workers would crash if it were imported eagerly.
    if (options.url) {
      let initialized = false;

      initPostgres = async () => {
        if (initialized) return;
        const { createPostgresDriver } = await import('./postgres-driver');
        driver = await createPostgresDriver(options.url!, options.pool);

        // Create replica drivers if configured
        const replicas = options.pool?.replicas;
        if (replicas && replicas.length > 0) {
          replicaDrivers = await Promise.all(
            replicas.map((replicaUrl) => createPostgresDriver(replicaUrl, options.pool)),
          );
        }
        initialized = true;
      };

      // Return a routing-aware query function
      return async <T>(sqlStr: string, params: readonly unknown[]) => {
        await initPostgres?.();

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
  // Build model delegates and top-level query method
  // -----------------------------------------------------------------------

  const delegates = buildDelegates(queryFn, models, dialectObj, modelsRegistry);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Delegates are typed externally via DatabaseClient<TModels>
  const client: Record<string, any> = { ...delegates };

  // -----------------------------------------------------------------------
  // Add top-level methods and _internals
  // -----------------------------------------------------------------------

  client.query = buildQueryMethod(queryFn);

  // -----------------------------------------------------------------------
  // Transaction support
  // -----------------------------------------------------------------------

  client.transaction = async <T>(
    fn: (tx: TransactionClient<TModels>) => Promise<T>,
  ): Promise<T> => {
    // Ensure driver is initialized for PostgreSQL (lazy init may not have run yet)
    if (initPostgres) {
      await initPostgres();
    }

    // PostgreSQL: use driver.beginTransaction() which calls sql.begin()
    if (driver?.beginTransaction) {
      return await driver.beginTransaction(async (txQueryFn: QueryFn) => {
        const txDelegates = buildDelegates(txQueryFn, models, dialectObj, modelsRegistry);
        const tx = {
          ...txDelegates,
          query: buildQueryMethod(txQueryFn),
        } as unknown as TransactionClient<TModels>;
        return fn(tx);
      });
    }
    // SQLite / testing fallback: BEGIN/COMMIT/ROLLBACK via queryFn
    // Safe for single-connection backends (SQLite, in-memory test stubs)
    await queryFn('BEGIN', []);
    try {
      const tx = {
        ...delegates,
        query: client.query,
      } as unknown as TransactionClient<TModels>;
      const result = await fn(tx);
      await queryFn('COMMIT', []);
      return result;
    } catch (e) {
      try {
        await queryFn('ROLLBACK', []);
      } catch {
        // Swallow ROLLBACK failure — preserve the original error
      }
      throw e;
    }
  };

  client.close = async (): Promise<void> => {
    if (driver) {
      await driver.close();
    }
    if (sqliteDriver) {
      await sqliteDriver.close();
    }
    await Promise.all(replicaDrivers.map((r) => r.close()));
  };

  client.isHealthy = async (): Promise<boolean> => {
    if (driver) {
      return driver.isHealthy();
    }
    if (sqliteDriver) {
      return sqliteDriver.isHealthy();
    }
    return true;
  };

  client._internals = {
    models,
    dialect: dialectObj,
    tenantGraph,
  };

  return client as DatabaseClient<TModels>;
}
