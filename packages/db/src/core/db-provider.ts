import { type CreateDbOptions, createDb, type DatabaseInstance } from '../client/database';
import { ConnectionError } from '../errors/db-error';
import type { ModelEntry } from '../schema/inference';

// ---------------------------------------------------------------------------
// DbProviderConfig — same as CreateDbOptions, passed through to createDb
// ---------------------------------------------------------------------------

export type DbProviderConfig<TModels extends Record<string, ModelEntry>> = CreateDbOptions<TModels>;

// ---------------------------------------------------------------------------
// ServiceDef-compatible shape (structural typing — no @vertz/core import)
// ---------------------------------------------------------------------------

export interface DbProviderDef<TModels extends Record<string, ModelEntry>> {
  readonly onInit: (deps: Record<string, never>) => Promise<DatabaseInstance<TModels>>;
  readonly methods: (
    deps: Record<string, never>,
    state: DatabaseInstance<TModels>,
  ) => DatabaseInstance<TModels>;
  readonly onDestroy: (
    deps: Record<string, never>,
    state: DatabaseInstance<TModels>,
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
 * - `methods` returns the `DatabaseInstance` directly — all query methods available.
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
