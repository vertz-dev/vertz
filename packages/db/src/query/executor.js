/**
 * Query executor — wraps raw SQL execution with error mapping.
 *
 * Takes a query function (from the database driver) and wraps it to:
 * 1. Execute parameterized SQL
 * 2. Map PG errors to typed DbError subclasses
 * 3. Return typed QueryResult
 */
import { parsePgError } from '../errors/pg-parser';

/**
 * Determine if an error is a PG-style error with a `code` property.
 */
function isPgError(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
/**
 * Execute a SQL query, mapping PG errors to typed DbError.
 */
export async function executeQuery(queryFn, sql, params) {
  try {
    return await queryFn(sql, params);
  } catch (error) {
    if (isPgError(error)) {
      throw parsePgError(error, sql);
    }
    throw error;
  }
}
//# sourceMappingURL=executor.js.map
