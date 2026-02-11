import * as agg from '../query/aggregate';
import * as crud from '../query/crud';
import type { QueryFn } from '../query/executor';
import { type IncludeSpec, loadRelations, type TableRegistryEntry } from '../query/relation-loader';
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
// Typed query option types
// ---------------------------------------------------------------------------

/** Options for findOne / findOneOrThrow */
interface TypedFindOneOptions {
  readonly where?: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly include?: Record<
    string,
    true | { select?: Record<string, true>; include?: IncludeSpec }
  >;
}

/** Options for findMany / findManyAndCount */
interface TypedFindManyOptions {
  readonly where?: Record<string, unknown>;
  readonly select?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
  /** Cursor object: column-value pairs marking the position to paginate from. */
  readonly cursor?: Record<string, unknown>;
  /** Number of rows to take (used with cursor). Aliases `limit` when cursor is present. */
  readonly take?: number;
  readonly include?: Record<
    string,
    true | { select?: Record<string, true>; include?: IncludeSpec }
  >;
}

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
  // Find queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Find a single row or null.
   */
  findOne<TName extends keyof TTables & string>(
    table: TName,
    options?: TypedFindOneOptions,
  ): Promise<unknown>;

  /**
   * Find a single row or throw NotFoundError.
   */
  findOneOrThrow<TName extends keyof TTables & string>(
    table: TName,
    options?: TypedFindOneOptions,
  ): Promise<unknown>;

  /**
   * Find multiple rows.
   */
  findMany<TName extends keyof TTables & string>(
    table: TName,
    options?: TypedFindManyOptions,
  ): Promise<unknown[]>;

  /**
   * Find multiple rows with total count.
   */
  findManyAndCount<TName extends keyof TTables & string>(
    table: TName,
    options?: TypedFindManyOptions,
  ): Promise<{ data: unknown[]; total: number }>;

  // -------------------------------------------------------------------------
  // Create queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert a single row and return it.
   */
  create<TName extends keyof TTables & string>(
    table: TName,
    options: { data: Record<string, unknown>; select?: Record<string, unknown> },
  ): Promise<unknown>;

  /**
   * Insert multiple rows and return the count.
   */
  createMany<TName extends keyof TTables & string>(
    table: TName,
    options: { data: readonly Record<string, unknown>[] },
  ): Promise<{ count: number }>;

  /**
   * Insert multiple rows and return them.
   */
  createManyAndReturn<TName extends keyof TTables & string>(
    table: TName,
    options: { data: readonly Record<string, unknown>[]; select?: Record<string, unknown> },
  ): Promise<unknown[]>;

  // -------------------------------------------------------------------------
  // Update queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Update matching rows and return the first. Throws NotFoundError if none match.
   */
  update<TName extends keyof TTables & string>(
    table: TName,
    options: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
      select?: Record<string, unknown>;
    },
  ): Promise<unknown>;

  /**
   * Update matching rows and return the count.
   */
  updateMany<TName extends keyof TTables & string>(
    table: TName,
    options: { where: Record<string, unknown>; data: Record<string, unknown> },
  ): Promise<{ count: number }>;

  // -------------------------------------------------------------------------
  // Upsert (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Insert or update a row.
   */
  upsert<TName extends keyof TTables & string>(
    table: TName,
    options: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select?: Record<string, unknown>;
    },
  ): Promise<unknown>;

  // -------------------------------------------------------------------------
  // Delete queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Delete a matching row and return it. Throws NotFoundError if none match.
   */
  delete<TName extends keyof TTables & string>(
    table: TName,
    options: { where: Record<string, unknown>; select?: Record<string, unknown> },
  ): Promise<unknown>;

  /**
   * Delete matching rows and return the count.
   */
  deleteMany<TName extends keyof TTables & string>(
    table: TName,
    options: { where: Record<string, unknown> },
  ): Promise<{ count: number }>;

  // -------------------------------------------------------------------------
  // Aggregation queries (DB-012)
  // -------------------------------------------------------------------------

  /**
   * Count rows matching an optional filter.
   */
  count<TName extends keyof TTables & string>(
    table: TName,
    options?: { where?: Record<string, unknown> },
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

  // Pre-compute the table registry for relation loading
  // TableEntry is structurally compatible with TableRegistryEntry
  const tablesRegistry = tables as Record<string, TableRegistryEntry>;

  // Query function: use injected _queryFn or throw
  const queryFn: QueryFn =
    options._queryFn ??
    (async () => {
      throw new Error(
        'db.query() requires a connected postgres driver. ' +
          'Driver integration is not yet available — see the implementation plan for the driver phase.',
      );
    });

  return {
    _tables: tables,
    $tenantGraph: tenantGraph,

    async query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<T>> {
      return queryFn<T>(fragment.sql, fragment.params);
    },

    async close(): Promise<void> {
      // Stub — real pool.end() will be called here when postgres driver is integrated
    },

    async isHealthy(): Promise<boolean> {
      // Stub — real health check (SELECT 1) will be done here when postgres driver is integrated
      return true;
    },

    // -----------------------------------------------------------------------
    // Find queries
    // -----------------------------------------------------------------------

    async findOne(name, opts) {
      const entry = resolveTable(tables, name);
      const result = await crud.findOne(queryFn, entry.table, opts);
      if (result !== null && opts?.include) {
        const rows = await loadRelations(
          queryFn,
          [result as Record<string, unknown>],
          entry.relations as Record<string, import('../schema/relation').RelationDef>,
          opts.include as IncludeSpec,
          0,
          tablesRegistry,
          entry.table,
        );
        return rows[0] ?? null;
      }
      return result;
    },

    async findOneOrThrow(name, opts) {
      const entry = resolveTable(tables, name);
      const result = await crud.findOneOrThrow(queryFn, entry.table, opts);
      if (opts?.include) {
        const rows = await loadRelations(
          queryFn,
          [result as Record<string, unknown>],
          entry.relations as Record<string, import('../schema/relation').RelationDef>,
          opts.include as IncludeSpec,
          0,
          tablesRegistry,
          entry.table,
        );
        return rows[0] as Record<string, unknown>;
      }
      return result;
    },

    async findMany(name, opts) {
      const entry = resolveTable(tables, name);
      const results = await crud.findMany(queryFn, entry.table, opts);
      if (opts?.include && results.length > 0) {
        return loadRelations(
          queryFn,
          results as Record<string, unknown>[],
          entry.relations as Record<string, import('../schema/relation').RelationDef>,
          opts.include as IncludeSpec,
          0,
          tablesRegistry,
          entry.table,
        );
      }
      return results;
    },

    async findManyAndCount(name, opts) {
      const entry = resolveTable(tables, name);
      const { data, total } = await crud.findManyAndCount(queryFn, entry.table, opts);
      if (opts?.include && data.length > 0) {
        const withRelations = await loadRelations(
          queryFn,
          data as Record<string, unknown>[],
          entry.relations as Record<string, import('../schema/relation').RelationDef>,
          opts.include as IncludeSpec,
          0,
          tablesRegistry,
          entry.table,
        );
        return { data: withRelations, total };
      }
      return { data, total };
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
