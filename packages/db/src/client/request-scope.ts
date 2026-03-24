/**
 * Per-request transaction scoping with SET LOCAL for Postgres RLS.
 *
 * Wraps a callback in a transaction that sets session variables
 * (app.tenant_id, app.user_id) via SET LOCAL. These variables are
 * visible to RLS policies during the transaction and automatically
 * reset when the transaction ends.
 *
 * Uses txSql.unsafe() for SET LOCAL because Postgres does not support
 * parameterized SET statements. UUID validation prevents SQL injection.
 */

import type { QueryFn } from '../query/executor';

// ---------------------------------------------------------------------------
// UUID validation
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID format.
 * This is critical for SQL injection prevention — the UUID is interpolated
 * directly into SET LOCAL statements via unsafe().
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// Session variables
// ---------------------------------------------------------------------------

export interface SessionVars {
  /** Tenant ID to set as app.tenant_id. Must be a valid UUID. */
  tenantId?: string;
  /** User ID to set as app.user_id. Must be a valid UUID. */
  userId?: string;
}

// ---------------------------------------------------------------------------
// withSessionVars
// ---------------------------------------------------------------------------

/**
 * Execute a callback within a Postgres transaction that has
 * SET LOCAL app.tenant_id and/or app.user_id configured.
 *
 * The session variables are transaction-scoped (SET LOCAL) and
 * automatically reset when the transaction commits or rolls back.
 *
 * @param queryFn - The database QueryFn (from driver or PGlite)
 * @param vars - Session variables to set (tenantId, userId)
 * @param fn - Callback that receives a transaction-scoped QueryFn
 * @returns The result of the callback
 */
export async function withSessionVars<T>(
  queryFn: QueryFn,
  vars: SessionVars,
  fn: (txQueryFn: QueryFn) => Promise<T>,
): Promise<T> {
  // Validate UUIDs BEFORE starting the transaction
  if (vars.tenantId !== undefined && !isValidUUID(vars.tenantId)) {
    throw new Error(`Invalid UUID for tenantId: "${vars.tenantId}"`);
  }
  if (vars.userId !== undefined && !isValidUUID(vars.userId)) {
    throw new Error(`Invalid UUID for userId: "${vars.userId}"`);
  }

  // BEGIN transaction
  await queryFn('BEGIN', []);

  try {
    // SET LOCAL session variables (unsafe because Postgres doesn't support parameterized SET)
    if (vars.tenantId !== undefined) {
      await queryFn(`SET LOCAL app.tenant_id = '${vars.tenantId}'`, []);
    }
    if (vars.userId !== undefined) {
      await queryFn(`SET LOCAL app.user_id = '${vars.userId}'`, []);
    }

    // Execute the callback with the same queryFn (already in transaction)
    const result = await fn(queryFn);

    // COMMIT
    await queryFn('COMMIT', []);

    return result;
  } catch (error) {
    // ROLLBACK on any error
    try {
      await queryFn('ROLLBACK', []);
    } catch {
      // Swallow ROLLBACK failure — preserve the original error
    }
    throw error;
  }
}
