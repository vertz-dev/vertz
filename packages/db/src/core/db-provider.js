import { createDb } from '../client/database';
import { ConnectionError } from '../errors/db-error';
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
export function createDbProvider(config) {
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
//# sourceMappingURL=db-provider.js.map
