import { type DbError, type DbErrorJson } from './db-error';
export interface HttpErrorResponse {
  readonly status: number;
  readonly body: DbErrorJson;
}
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
export declare function dbErrorToHttpError(error: DbError): HttpErrorResponse;
//# sourceMappingURL=http-adapter.d.ts.map
