/**
 * Shared types for DB-backed auth stores.
 *
 * Uses a minimal subset of DatabaseClient to avoid model delegate type variance issues.
 * Auth stores only need `query()` for raw SQL and `_internals.dialect` for DDL.
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
