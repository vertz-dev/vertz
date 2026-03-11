/**
 * Shared types for DB-backed auth stores.
 *
 * Uses a focused subset of DatabaseClient instead of the full generic client.
 * Most auth stores still rely on `query()` today, while session lookups can use
 * the typed `auth_sessions` delegate when available.
 *
 * NOTE: DML queries use standard SQL syntax compatible with both SQLite (3.24+)
 * and PostgreSQL (e.g., INSERT ... ON CONFLICT DO NOTHING).
 */

import type { DatabaseClient, ReadError } from '@vertz/db';
import type { Result } from '@vertz/errors';
import type { authModels } from './auth-models';

type AuthModels = typeof authModels;

/**
 * Minimal database interface for auth stores.
 *
 * Keeps raw query support for legacy stores, but exposes the typed
 * `auth_sessions` delegate so session lookups can go through the generated
 * client instead of ad hoc SQL strings. Includes `transaction` for atomic
 * multi-statement writes in plan and closure stores.
 */
export type AuthDbClient = Pick<
  DatabaseClient<AuthModels>,
  'auth_sessions' | 'query' | '_internals' | 'transaction'
>;

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
export function assertWrite(result: Result<unknown, ReadError>, context: string): void {
  if (!result.ok) {
    throw new Error(`Auth DB write failed (${context}): ${result.error.message}`);
  }
}
