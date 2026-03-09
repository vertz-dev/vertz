/**
 * Shared types for DB-backed auth stores.
 *
 * Uses a minimal subset of DatabaseClient to avoid model delegate type variance issues.
 * Auth stores only need `query()` for raw SQL and `_internals.dialect` for DDL.
 *
 * NOTE: DML queries use standard SQL syntax compatible with both SQLite (3.24+)
 * and PostgreSQL (e.g., INSERT ... ON CONFLICT DO NOTHING).
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

/**
 * Convert a boolean to a dialect-appropriate value.
 * PostgreSQL BOOLEAN columns accept true/false; SQLite uses 1/0.
 */
export function boolVal(db: AuthDbClient, value: boolean): boolean | number {
  return db._internals.dialect.name === 'sqlite' ? (value ? 1 : 0) : value;
}

/**
 * Assert a write query succeeded. Throws if the result is an error.
 */
export function assertWrite(
  result: Result<QueryResult<unknown>, ReadError>,
  context: string,
): void {
  if (!result.ok) {
    throw new Error(`Auth DB write failed (${context}): ${result.error.message}`);
  }
}
