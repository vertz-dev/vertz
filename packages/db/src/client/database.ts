import * as agg from '../query/aggregate';
import * as crud from '../query/crud';
import type { QueryFn } from '../query/executor';
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

/** Options for findOne / findOneOrThrow — typed per-table. */
type TypedFindOneOptions<TEntry extends TableEntry> = {
  readonly where?: FilterType<EntryColumns<TEntry>>;
  readonly select?: SelectOption<EntryColumns<TEntry>>;
  readonly orderBy?: OrderByType<EntryColumns<TEntry>>;
  readonly include?: IncludeOption<EntryRelations<TEntry>>;
};

/** Options for findMany / findManyAndCount — typed per-table. */
type TypedFindManyOptions<TEntry extends TableEntry> = {
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
  // Find queries (DB-010)
  // -------------------------------------------------------------------------

  /**
   * Find a single row or null.
   */
  findOne<
    TName extends keyof TTables & string,
    TOptions extends TypedFindOneOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<FindResult<
    EntryTable<TTables[TName]>,
    TOptions,
    EntryRelations<TTables[TName]>
  > | null>;

  /**
   * Find a single row or throw NotFoundError.
   */
  findOneOrThrow<
    TName extends keyof TTables & string,
    TOptions extends TypedFindOneOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>>;

  /**
   * Find multiple rows.
   */
  findMany<
    TName extends keyof TTables & string,
    TOptions extends TypedFindManyOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[]>;

  /**
   * Find multiple rows with total count.
   */
  findManyAndCount<
    TName extends keyof TTables & string,
    TOptions extends TypedFindManyOptions<TTables[TName]>,
  >(
    table: TName,
    options?: TOptions,
  ): Promise<{
    data: FindResult<EntryTable<TTables[TName]>, TOptions, EntryRelations<TTables[TName]>>[];
    total: number;
  }>;

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

    async findOne(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      const result = await crud.findOne(queryFn, entry.table, opts as crud.FindOneArgs);
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

    async findOneOrThrow(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      const result = await crud.findOneOrThrow(queryFn, entry.table, opts as crud.FindOneArgs);
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

    async findMany(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      const results = await crud.findMany(queryFn, entry.table, opts as crud.FindManyArgs);
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

    async findManyAndCount(name, opts): Promise<AnyResult> {
      const entry = resolveTable(tables, name);
      const { data, total } = await crud.findManyAndCount(
        queryFn,
        entry.table,
        opts as crud.FindManyArgs,
      );
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
