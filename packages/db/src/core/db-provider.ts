import { type CreateDbOptions, createDb, type DatabaseInstance } from '../client/database';
import { ConnectionError } from '../errors/db-error';
import type { TableEntry } from '../schema/inference';

// ---------------------------------------------------------------------------
// DbProviderConfig — same as CreateDbOptions, passed through to createDb
// ---------------------------------------------------------------------------

export type DbProviderConfig<TTables extends Record<string, TableEntry>> = CreateDbOptions<TTables>;

// ---------------------------------------------------------------------------
// ServiceDef-compatible shape (structural typing — no @vertz/core import)
// ---------------------------------------------------------------------------

export interface DbProviderDef<TTables extends Record<string, TableEntry>> {
  readonly onInit: (deps: Record<string, never>) => Promise<DatabaseInstance<TTables>>;
  readonly methods: (
    deps: Record<string, never>,
    state: DatabaseInstance<TTables>,
  ) => DatabaseInstance<TTables>;
  readonly onDestroy: (
    deps: Record<string, never>,
    state: DatabaseInstance<TTables>,
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
 *   tables: { users: { table: users, relations: {} } },
 * });
 *
 * const dbService = appDef.service(dbProvider);
 * ```
 */
export function createDbProvider<TTables extends Record<string, TableEntry>>(
  config: DbProviderConfig<TTables>,
): DbProviderDef<TTables> {
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
