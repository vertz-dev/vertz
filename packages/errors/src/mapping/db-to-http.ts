/**
 * Maps database domain errors to HTTP status codes.
 */

import type { ReadError, WriteError, NotFoundError, UniqueViolation, FKViolation, NotNullViolation, CheckViolation } from '../domain/db.js';

/**
 * Maps a database error to an HTTP status code.
 *
 * @param error - A database domain error
 * @returns HTTP status code
 *
 * @example
 * const status = dbErrorToHttpStatus(error);
 * // NOT_FOUND → 404
 * // UNIQUE_VIOLATION → 409
 * // FK_VIOLATION → 422
 * // NOT_NULL_VIOLATION → 422
 * // CHECK_VIOLATION → 422
 */
export function dbErrorToHttpStatus(error: ReadError | WriteError): number {
  const code = error.code;

  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'UNIQUE_VIOLATION':
      return 409;
    case 'FK_VIOLATION':
      return 422;
    case 'NOT_NULL_VIOLATION':
      return 422;
    case 'CHECK_VIOLATION':
      return 422;
    default:
      // Should never happen if all cases are covered
      return 500;
  }
}

/**
 * Maps a NotFoundError to HTTP status.
 */
export function notFoundErrorToHttpStatus(_error: NotFoundError): number {
  return 404;
}

/**
 * Maps a UniqueViolation to HTTP status.
 */
export function uniqueViolationToHttpStatus(_error: UniqueViolation): number {
  return 409;
}

/**
 * Maps a FKViolation to HTTP status.
 */
export function fkViolationToHttpStatus(_error: FKViolation): number {
  return 422;
}

/**
 * Maps a NotNullViolation to HTTP status.
 */
export function notNullViolationToHttpStatus(_error: NotNullViolation): number {
  return 422;
}

/**
 * Maps a CheckViolation to HTTP status.
 */
export function checkViolationToHttpStatus(_error: CheckViolation): number {
  return 422;
}
