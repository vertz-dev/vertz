import { type CreateDbOptions, type DatabaseInstance } from '../client/database';
import type { TableEntry } from '../schema/inference';
export type DbProviderConfig<TTables extends Record<string, TableEntry>> = CreateDbOptions<TTables>;
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
export declare function createDbProvider<TTables extends Record<string, TableEntry>>(
  config: DbProviderConfig<TTables>,
): DbProviderDef<TTables>;
//# sourceMappingURL=db-provider.d.ts.map
