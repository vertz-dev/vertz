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

/**
 * Handler map type for EntityError.
 * Each key corresponds to an error code, and the value is a handler function.
 */
type EntityErrorHandlers<R> = {
  BadRequest: (error: Extract<EntityErrorType, { code: 'BadRequest' }>) => R;
  Unauthorized: (error: Extract<EntityErrorType, { code: 'Unauthorized' }>) => R;
  Forbidden: (error: Extract<EntityErrorType, { code: 'Forbidden' }>) => R;
  NotFound: (error: Extract<EntityErrorType, { code: 'NotFound' }>) => R;
  MethodNotAllowed: (error: Extract<EntityErrorType, { code: 'MethodNotAllowed' }>) => R;
  Conflict: (error: Extract<EntityErrorType, { code: 'Conflict' }>) => R;
  ValidationError: (
    error: Extract<EntityErrorType, { code: 'ValidationError' }>,
  ) => R;
  InternalError: (error: Extract<EntityErrorType, { code: 'InternalError' }>) => R;
  ServiceUnavailable: (error: Extract<EntityErrorType, { code: 'ServiceUnavailable' }>) => R;
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
  // Check if it's a FetchError or EntityError by checking for known FetchError codes
  const isFetchError =
    error.code === 'NetworkError' ||
    error.code === 'HttpError' ||
    error.code === 'TimeoutError' ||
    error.code === 'ParseError' ||
    error.code === 'ValidationError';

  if (isFetchError) {
    const code = (error as FetchErrorType).code;
    switch (code) {
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
    }
  }

  const code = (error as EntityErrorType).code;
  switch (code) {
    case 'BadRequest':
      return (handlers as EntityErrorHandlers<R>).BadRequest(
        error as Extract<EntityErrorType, { code: 'BadRequest' }>,
      );
    case 'Unauthorized':
      return (handlers as EntityErrorHandlers<R>).Unauthorized(
        error as Extract<EntityErrorType, { code: 'Unauthorized' }>,
      );
    case 'Forbidden':
      return (handlers as EntityErrorHandlers<R>).Forbidden(
        error as Extract<EntityErrorType, { code: 'Forbidden' }>,
      );
    case 'NotFound':
      return (handlers as EntityErrorHandlers<R>).NotFound(
        error as Extract<EntityErrorType, { code: 'NotFound' }>,
      );
    case 'MethodNotAllowed':
      return (handlers as EntityErrorHandlers<R>).MethodNotAllowed(
        error as Extract<EntityErrorType, { code: 'MethodNotAllowed' }>,
      );
    case 'Conflict':
      return (handlers as EntityErrorHandlers<R>).Conflict(
        error as Extract<EntityErrorType, { code: 'Conflict' }>,
      );
    case 'ValidationError':
      return (handlers as EntityErrorHandlers<R>).ValidationError(
        error as Extract<EntityErrorType, { code: 'ValidationError' }>,
      );
    case 'InternalError':
      return (handlers as EntityErrorHandlers<R>).InternalError(
        error as Extract<EntityErrorType, { code: 'InternalError' }>,
      );
    case 'ServiceUnavailable':
      return (handlers as EntityErrorHandlers<R>).ServiceUnavailable(
        error as Extract<EntityErrorType, { code: 'ServiceUnavailable' }>,
      );
  }

  // This ensures compile-time exhaustiveness checking
  const checkExhaustive = (c: never): never => {
    throw new Error(`Unhandled error code: ${c}`);
  };
  return checkExhaustive(code);
}
