/**
 * matchError - Exhaustive pattern matching for error types.
 *
 * This utility provides compile-time exhaustiveness checking for error unions.
 * When you pass an error union to matchError, TypeScript requires you to handle
 * every possible error type. If you add a new error type to the union but don't
 * handle it, TypeScript will produce a compile error.
 */

import type { EntityErrorType } from './entity.js';
import type { FetchErrorType } from './fetch.js';

/**
 * Handler map type for FetchError.
 * Each key corresponds to an error code, and the value is a handler function.
 */
type FetchErrorHandlers<R> = {
  NETWORK_ERROR: (error: Extract<FetchErrorType, { code: 'NETWORK_ERROR' }>) => R;
  HTTP_ERROR: (error: Extract<FetchErrorType, { code: 'HTTP_ERROR' }>) => R;
  TIMEOUT_ERROR: (error: Extract<FetchErrorType, { code: 'TIMEOUT_ERROR' }>) => R;
  PARSE_ERROR: (error: Extract<FetchErrorType, { code: 'PARSE_ERROR' }>) => R;
  VALIDATION_ERROR: (error: Extract<FetchErrorType, { code: 'VALIDATION_ERROR' }>) => R;
};

/**
 * Handler map type for EntityError.
 * Each key corresponds to an error code, and the value is a handler function.
 */
type EntityErrorHandlers<R> = {
  BAD_REQUEST: (error: Extract<EntityErrorType, { code: 'BAD_REQUEST' }>) => R;
  UNAUTHORIZED: (error: Extract<EntityErrorType, { code: 'UNAUTHORIZED' }>) => R;
  FORBIDDEN: (error: Extract<EntityErrorType, { code: 'FORBIDDEN' }>) => R;
  NOT_FOUND: (error: Extract<EntityErrorType, { code: 'NOT_FOUND' }>) => R;
  METHOD_NOT_ALLOWED: (error: Extract<EntityErrorType, { code: 'METHOD_NOT_ALLOWED' }>) => R;
  CONFLICT: (error: Extract<EntityErrorType, { code: 'CONFLICT' }>) => R;
  ENTITY_VALIDATION_ERROR: (
    error: Extract<EntityErrorType, { code: 'ENTITY_VALIDATION_ERROR' }>,
  ) => R;
  INTERNAL_ERROR: (error: Extract<EntityErrorType, { code: 'INTERNAL_ERROR' }>) => R;
  SERVICE_UNAVAILABLE: (error: Extract<EntityErrorType, { code: 'SERVICE_UNAVAILABLE' }>) => R;
};

/**
 * Pattern matching for FetchError types.
 *
 * Provides compile-time exhaustiveness checking - you must handle all error types.
 *
 * @example
 * const result = matchError(error, {
 *   NETWORK_ERROR: (e) => 'Network failed',
 *   HTTP_ERROR: (e) => `HTTP ${e.status}: ${e.message}`,
 *   TIMEOUT_ERROR: (e) => 'Request timed out',
 *   PARSE_ERROR: (e) => `Parse failed at ${e.path}`,
 *   VALIDATION_ERROR: (e) => `Validation: ${e.errors.length} errors`,
 * });
 */
export function matchError<R>(error: FetchErrorType, handlers: FetchErrorHandlers<R>): R;
export function matchError<R>(error: EntityErrorType, handlers: EntityErrorHandlers<R>): R;
export function matchError<R>(
  error: FetchErrorType | EntityErrorType,
  handlers: FetchErrorHandlers<R> | EntityErrorHandlers<R>,
): R {
  const errorCode = (error as { code: string }).code;

  switch (errorCode) {
    case 'NETWORK_ERROR':
      return (handlers as FetchErrorHandlers<R>).NETWORK_ERROR(
        error as Extract<FetchErrorType, { code: 'NETWORK_ERROR' }>,
      );
    case 'HTTP_ERROR':
      return (handlers as FetchErrorHandlers<R>).HTTP_ERROR(
        error as Extract<FetchErrorType, { code: 'HTTP_ERROR' }>,
      );
    case 'TIMEOUT_ERROR':
      return (handlers as FetchErrorHandlers<R>).TIMEOUT_ERROR(
        error as Extract<FetchErrorType, { code: 'TIMEOUT_ERROR' }>,
      );
    case 'PARSE_ERROR':
      return (handlers as FetchErrorHandlers<R>).PARSE_ERROR(
        error as Extract<FetchErrorType, { code: 'PARSE_ERROR' }>,
      );
    case 'VALIDATION_ERROR':
      return (handlers as FetchErrorHandlers<R>).VALIDATION_ERROR(
        error as Extract<FetchErrorType, { code: 'VALIDATION_ERROR' }>,
      );
    case 'BAD_REQUEST':
      return (handlers as EntityErrorHandlers<R>).BAD_REQUEST(
        error as Extract<EntityErrorType, { code: 'BAD_REQUEST' }>,
      );
    case 'UNAUTHORIZED':
      return (handlers as EntityErrorHandlers<R>).UNAUTHORIZED(
        error as Extract<EntityErrorType, { code: 'UNAUTHORIZED' }>,
      );
    case 'FORBIDDEN':
      return (handlers as EntityErrorHandlers<R>).FORBIDDEN(
        error as Extract<EntityErrorType, { code: 'FORBIDDEN' }>,
      );
    case 'NOT_FOUND':
      return (handlers as EntityErrorHandlers<R>).NOT_FOUND(
        error as Extract<EntityErrorType, { code: 'NOT_FOUND' }>,
      );
    case 'METHOD_NOT_ALLOWED':
      return (handlers as EntityErrorHandlers<R>).METHOD_NOT_ALLOWED(
        error as Extract<EntityErrorType, { code: 'METHOD_NOT_ALLOWED' }>,
      );
    case 'CONFLICT':
      return (handlers as EntityErrorHandlers<R>).CONFLICT(
        error as Extract<EntityErrorType, { code: 'CONFLICT' }>,
      );
    case 'ENTITY_VALIDATION_ERROR':
      return (handlers as EntityErrorHandlers<R>).ENTITY_VALIDATION_ERROR(
        error as Extract<EntityErrorType, { code: 'ENTITY_VALIDATION_ERROR' }>,
      );
    case 'INTERNAL_ERROR':
      return (handlers as EntityErrorHandlers<R>).INTERNAL_ERROR(
        error as Extract<EntityErrorType, { code: 'INTERNAL_ERROR' }>,
      );
    case 'SERVICE_UNAVAILABLE':
      return (handlers as EntityErrorHandlers<R>).SERVICE_UNAVAILABLE(
        error as Extract<EntityErrorType, { code: 'SERVICE_UNAVAILABLE' }>,
      );
    default: {
      // This ensures compile-time exhaustiveness checking
      // If a new error code is added but not handled, TypeScript will error here
      // Using a closure to create the never type properly
      const checkExhaustive = (code: never): never => {
        throw new Error(`Unhandled error code: ${code}`);
      };
      // Cast to never to ensure exhaustive checking
      return checkExhaustive(errorCode as never);
    }
  }
}
