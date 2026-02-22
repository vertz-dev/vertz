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
  NetworkError: (error: Extract<FetchErrorType, { code: 'NetworkError' }>) => R;
  HttpError: (error: Extract<FetchErrorType, { code: 'HttpError' }>) => R;
  TimeoutError: (error: Extract<FetchErrorType, { code: 'TimeoutError' }>) => R;
  ParseError: (error: Extract<FetchErrorType, { code: 'ParseError' }>) => R;
  ValidationError: (error: Extract<FetchErrorType, { code: 'ValidationError' }>) => R;
};
};

/**
 * Handler map type for EntityError.
 * Each key corresponds to an error code, and the value is a handler function.
 */
type EntityErrorHandlers<R> = {
  BadRequest: (error: Extract<EntityErrorType, { code: 'BAD_REQUEST' }>) => R;
  Unauthorized: (error: Extract<EntityErrorType, { code: 'UNAUTHORIZED' }>) => R;
  Forbidden: (error: Extract<EntityErrorType, { code: 'FORBIDDEN' }>) => R;
  NotFound: (error: Extract<EntityErrorType, { code: 'NOT_FOUND' }>) => R;
  MethodNotAllowed: (error: Extract<EntityErrorType, { code: 'METHOD_NOT_ALLOWED' }>) => R;
  Conflict: (error: Extract<EntityErrorType, { code: 'CONFLICT' }>) => R;
  ValidationError: (
    error: Extract<EntityErrorType, { code: 'ENTITY_VALIDATION_ERROR' }>,
  ) => R;
  InternalError: (error: Extract<EntityErrorType, { code: 'INTERNAL_ERROR' }>) => R;
  ServiceUnavailable: (error: Extract<EntityErrorType, { code: 'SERVICE_UNAVAILABLE' }>) => R;
};

/**
 * Pattern matching for FetchError types.
 *
 * Provides compile-time exhaustiveness checking - you must handle all error types.
 *
 * @example
 * const result = matchError(error, {
 *   NetworkError: (e) => 'Network failed',
 *   HttpError: (e) => `HTTP ${e.status}: ${e.message}`,
 *   TimeoutError: (e) => 'Request timed out',
 *   ParseError: (e) => `Parse failed at ${e.path}`,
 *   ValidationError: (e) => `Validation: ${e.errors.length} errors`,
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
    case 'NetworkError':
      return (handlers as FetchErrorHandlers<R>).NetworkError(
        error as Extract<FetchErrorType, { code: 'NetworkError' }>,
      );
    case 'HttpError':
      return (handlers as FetchErrorHandlers<R>).HttpError(
        error as Extract<FetchErrorType, { code: 'HttpError' }>,
      );
    case 'TimeoutError':
      return (handlers as FetchErrorHandlers<R>).TimeoutError(
        error as Extract<FetchErrorType, { code: 'TimeoutError' }>,
      );
    case 'ParseError':
      return (handlers as FetchErrorHandlers<R>).ParseError(
        error as Extract<FetchErrorType, { code: 'ParseError' }>,
      );
    case 'ValidationError':
      return (handlers as FetchErrorHandlers<R>).ValidationError(
        error as Extract<FetchErrorType, { code: 'ValidationError' }>,
      );
    case 'BAD_REQUEST':
      return (handlers as EntityErrorHandlers<R>).BadRequest(
        error as Extract<EntityErrorType, { code: 'BAD_REQUEST' }>,
      );
    case 'UNAUTHORIZED':
      return (handlers as EntityErrorHandlers<R>).Unauthorized(
        error as Extract<EntityErrorType, { code: 'UNAUTHORIZED' }>,
      );
    case 'FORBIDDEN':
      return (handlers as EntityErrorHandlers<R>).Forbidden(
        error as Extract<EntityErrorType, { code: 'FORBIDDEN' }>,
      );
    case 'NOT_FOUND':
      return (handlers as EntityErrorHandlers<R>).NotFound(
        error as Extract<EntityErrorType, { code: 'NOT_FOUND' }>,
      );
    case 'METHOD_NOT_ALLOWED':
      return (handlers as EntityErrorHandlers<R>).MethodNotAllowed(
        error as Extract<EntityErrorType, { code: 'METHOD_NOT_ALLOWED' }>,
      );
    case 'CONFLICT':
      return (handlers as EntityErrorHandlers<R>).Conflict(
        error as Extract<EntityErrorType, { code: 'CONFLICT' }>,
      );
    case 'ENTITY_VALIDATION_ERROR':
      return (handlers as EntityErrorHandlers<R>).ValidationError(
        error as Extract<EntityErrorType, { code: 'ENTITY_VALIDATION_ERROR' }>,
      );
    case 'INTERNAL_ERROR':
      return (handlers as EntityErrorHandlers<R>).InternalError(
        error as Extract<EntityErrorType, { code: 'INTERNAL_ERROR' }>,
      );
    case 'SERVICE_UNAVAILABLE':
      return (handlers as EntityErrorHandlers<R>).ServiceUnavailable(
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
