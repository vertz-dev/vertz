import { type CreateDbOptions, createDb, type DatabaseClient } from '../client/database';
import { ConnectionError } from '../errors/db-error';
import { autoMigrate, type SchemaSnapshot } from '../migration';
import type { ModelEntry } from '../schema/inference';
import type { TableDef } from '../schema/table';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the current schema snapshot from the database models.
 * This uses the table definitions registered via d.table().
 */
function extractSchemaSnapshot<TModels extends Record<string, ModelEntry>>(
  models: TModels,
): SchemaSnapshot {
  const tables: SchemaSnapshot['tables'] = {};
  const enums: SchemaSnapshot['enums'] = {};

  for (const [name, entry] of Object.entries(models)) {
    const tableDef = entry.table as TableDef | undefined;
    if (!tableDef) continue;

    tables[name] = {
      columns: {},
      indexes: [],
      foreignKeys: [],
      _metadata: {},
    };

    // Extract columns from the table definition
    if (tableDef._columns) {
      for (const [colName, col] of Object.entries(tableDef._columns)) {
        const meta = col._meta;
        tables[name].columns[colName] = {
          type: meta.sqlType,
          nullable: meta.nullable ?? true,
          primary: meta.primary ?? false,
          unique: meta.unique ?? false,
        };

        if (meta.hasDefault && meta.defaultValue !== undefined) {
          const rawDefault = String(meta.defaultValue);
          tables[name].columns[colName].default = rawDefault === 'now' ? 'now()' : rawDefault;
        }

        if (meta.sensitive) {
          tables[name].columns[colName].sensitive = true;
        }

        if (meta.hidden) {
          tables[name].columns[colName].hidden = true;
        }

        if (meta.enumName && meta.enumValues) {
          enums[meta.enumName] = [...meta.enumValues];
        }
      }
    }

    // Extract indexes
    if (tableDef._indexes) {
      for (const idx of tableDef._indexes) {
        tables[name].indexes.push({
          name: idx.name,
          columns: [...idx.columns],
          unique: idx.unique ?? false,
        });
      }
    }
  }

  return {
    version: 1,
    tables,
    enums,
  };
}

/**
 * Check if auto-migration should run based on config and environment.
 */
function shouldAutoMigrate(config: DbProviderMigrationsConfig | undefined): boolean {
  if (config?.autoApply === true) {
    return true;
  }
  // Default: auto-apply in non-production environments
  if (config?.autoApply === undefined || config?.autoApply === null) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

// ---------------------------------------------------------------------------
// Migrations config
// ---------------------------------------------------------------------------

export interface DbProviderMigrationsConfig {
  /** Automatically apply schema changes in development. Default: NODE_ENV !== 'production' */
  autoApply?: boolean;
  /** Path to the schema snapshot file. Default: '.vertz/schema-snapshot.json' */
  snapshotPath?: string;
  /** Database dialect - 'sqlite' or 'postgres'. Default: 'sqlite' */
  dialect?: 'sqlite' | 'postgres';
}

// ---------------------------------------------------------------------------
// DbProviderConfig — same as CreateDbOptions, passed through to createDb
// ---------------------------------------------------------------------------

export type DbProviderConfig<TModels extends Record<string, ModelEntry>> =
  CreateDbOptions<TModels> & {
    /** Migration configuration for auto-migrations. */
    migrations?: DbProviderMigrationsConfig;
  };

// ---------------------------------------------------------------------------
// ServiceDef-compatible shape (structural typing — no @vertz/core import)
// ---------------------------------------------------------------------------

export interface DbProviderDef<TModels extends Record<string, ModelEntry>> {
  readonly onInit: (deps: Record<string, never>) => Promise<DatabaseClient<TModels>>;
  readonly methods: (
    deps: Record<string, never>,
    state: DatabaseClient<TModels>,
  ) => DatabaseClient<TModels>;
  readonly onDestroy: (
    deps: Record<string, never>,
    state: DatabaseClient<TModels>,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// createDbProvider
// ---------------------------------------------------------------------------

/**
 * Creates a core-compatible service definition that manages a database
 * connection lifecycle. The returned object implements the ServiceDef shape
 * via structural typing (no dependency on @vertz/core).
 *
 * - `onInit` creates the database instance and verifies connectivity.
 * - `methods` returns the `DatabaseClient` directly — all query methods available.
 * - `onDestroy` closes the connection pool.
 *
 * @example
 * ```typescript
 * import { createDbProvider } from '@vertz/db/core';
 *
 * const dbProvider = createDbProvider({
 *   url: process.env.DATABASE_URL!,
 *   models: { users: { table: users, relations: {} } },
 * });
 *
 * const dbService = appDef.service(dbProvider);
 * ```
 */
export function createDbProvider<TModels extends Record<string, ModelEntry>>(
  config: DbProviderConfig<TModels>,
): DbProviderDef<TModels> {
  return {
    async onInit() {
      const db = createDb(config);

      // Verify connectivity on startup
      const healthy = await db.isHealthy();
      if (!healthy) {
        await db.close();
        throw new ConnectionError(
          'Failed to connect to database. Verify the connection URL is correct and the database is running.',
        );
      }

      // Run auto-migration if configured
      if (shouldAutoMigrate(config.migrations)) {
        const snapshotPath = config.migrations?.snapshotPath ?? '.vertz/schema-snapshot.json';
        const dialect = config.migrations?.dialect ?? 'sqlite';
        const currentSchema = extractSchemaSnapshot(config.models);

        // Wrap db.query to match MigrationQueryFn signature
        const queryFn: (
          sql: string,
          params: readonly unknown[],
        ) => Promise<{
          rows: readonly Record<string, unknown>[];
          rowCount: number;
        }> = async (sql, params) => {
          const result = await db.query({
            _tag: 'SqlFragment' as const,
            sql,
            params,
          });
          if (result.ok) {
            return { rows: result.data.rows, rowCount: result.data.rowCount };
          }
          throw result.error;
        };

        await autoMigrate({
          currentSchema,
          snapshotPath,
          dialect: dialect as 'sqlite', // TODO: support postgres
          db: queryFn,
        });
      }

      return db;
    },

    methods(_deps, db) {
      return db;
    },

    async onDestroy(_deps, db) {
      await db.close();
    },
  };
}
