import {
  CheckConstraintError,
  ConnectionError,
  ForeignKeyError,
  NotFoundError,
  NotNullError,
  UniqueConstraintError,
} from './db-error';
// ---------------------------------------------------------------------------
// dbErrorToHttpError — maps DbError subtypes to HTTP status codes
// ---------------------------------------------------------------------------
/**
 * Maps a DbError to an HTTP error response with the appropriate status code.
 *
 * - UniqueConstraintError  -> 409 Conflict
 * - NotFoundError          -> 404 Not Found
 * - ForeignKeyError        -> 422 Unprocessable Entity
 * - NotNullError           -> 422 Unprocessable Entity
 * - CheckConstraintError   -> 422 Unprocessable Entity
 * - ConnectionError        -> 503 Service Unavailable
 * - Unknown DbError        -> 500 Internal Server Error
 */
export function dbErrorToHttpError(error) {
  const body = error.toJSON();
  if (error instanceof UniqueConstraintError) {
    return { status: 409, body };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body };
  }
  if (error instanceof ForeignKeyError) {
    return { status: 422, body };
  }
  if (error instanceof NotNullError) {
    return { status: 422, body };
  }
  if (error instanceof CheckConstraintError) {
    return { status: 422, body };
  }
  // ConnectionError check — must come after more specific checks.
  // ConnectionPoolExhaustedError extends ConnectionError, so both match here.
  if (error instanceof ConnectionError) {
    return { status: 503, body };
  }
  return { status: 500, body };
}
//# sourceMappingURL=http-adapter.js.map
