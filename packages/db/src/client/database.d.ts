import * as agg from '../query/aggregate';
import { type QueryFn } from '../query/executor';
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
import type { SqlFragment } from '../sql/tagged';
import { type TenantGraph } from './tenant-graph';
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
export declare function isReadQuery(sqlStr: string): boolean;
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
export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}
/** Extract the TableDef from a TableEntry. */
type EntryTable<TEntry extends TableEntry> = TEntry['table'];
/** Extract the relations record from a TableEntry. */
type EntryRelations<TEntry extends TableEntry> = TEntry['relations'];
/** Extract columns from a TableEntry's table. */
type EntryColumns<TEntry extends TableEntry> = EntryTable<TEntry>['_columns'];
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
  ): Promise<{
    count: number;
  }>;
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
  ): Promise<{
    count: number;
  }>;
  /**
   * Insert or update a row.
   */
  upsert<TName extends keyof TTables & string, TOptions extends TypedUpsertOptions<TTables[TName]>>(
    table: TName,
    options: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;
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
  ): Promise<{
    count: number;
  }>;
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
export declare function createDb<TTables extends Record<string, TableEntry>>(
  options: CreateDbOptions<TTables>,
): DatabaseInstance<TTables>;
//# sourceMappingURL=database.d.ts.map
