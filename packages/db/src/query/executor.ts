/**
 * Query executor — wraps raw SQL execution with error mapping.
 *
 * Takes a query function (from the database driver) and wraps it to:
 * 1. Execute parameterized SQL
 * 2. Map PG errors to typed DbError subclasses
 * 3. Return typed QueryResult
 */

import { DbError } from '../errors/db-error';
import { type PgErrorInput, parsePgError } from '../errors/pg-parser';

export interface ExecutorResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

export type QueryFn = <T>(sql: string, params: readonly unknown[]) => Promise<ExecutorResult<T>>;

/**
 * Determine if an error is a PG-style error with a `code` property.
 */
function isPgError(error: unknown): error is PgErrorInput {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as PgErrorInput).code === 'string' &&
    'message' in error &&
    typeof (error as PgErrorInput).message === 'string'
  );
}

/**
 * Execute a SQL query, mapping PG errors to typed DbError.
 */
export async function executeQuery<T>(
  queryFn: QueryFn,
  sql: string,
  params: readonly unknown[],
): Promise<ExecutorResult<T>> {
  try {
    return await queryFn<T>(sql, params);
  } catch (error: unknown) {
    // Pass typed framework errors through unchanged — pg-parser's default
    // branch would otherwise repackage them into UnknownDbError, destroying
    // the caller's ability to discriminate on the original class/code.
    if (error instanceof DbError) {
      throw error;
    }
    if (isPgError(error)) {
      throw parsePgError(error, sql);
    }
    throw error;
  }
}
