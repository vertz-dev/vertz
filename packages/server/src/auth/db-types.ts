/**
 * Shared types for DB-backed auth stores.
 *
 * Uses a minimal subset of DatabaseClient to avoid model delegate type variance issues.
 * Auth stores only need `query()` for raw SQL and `_internals.dialect` for DDL.
 *
 * NOTE: DML queries in DB stores currently target SQLite only (INSERT OR IGNORE,
 * ON CONFLICT DO UPDATE SET). PostgreSQL support will require dialect-aware DML
 * generation or a query builder abstraction.
 *
 * TODO: Add transaction support to AuthDbClient for PostgreSQL — multi-statement
 * operations (e.g., DbPlanStore.assignPlan deletes then inserts) need atomicity.
 * SQLite serializes single-writer operations so this is safe for now.
 */

import type { QueryResult, ReadError } from '@vertz/db';
import type { SqlFragment } from '@vertz/db/sql';
import type { Result } from '@vertz/errors';

/**
 * Minimal database interface for auth stores.
 * Only requires raw query capability and dialect info.
 */
export interface AuthDbClient {
  query<T = Record<string, unknown>>(
    fragment: SqlFragment,
  ): Promise<Result<QueryResult<T>, ReadError>>;
  _internals: {
    readonly models: Record<string, unknown>;
    readonly dialect: { readonly name: 'postgres' | 'sqlite' };
  };
}
