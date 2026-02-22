/**
 * Maps HTTP responses to client domain errors.
 */

import type {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '../domain/client.js';

/**
 * Unknown error response from server.
 */
export interface UnknownError {
  readonly code: 'UNKNOWN';
  readonly message: string;
  readonly status: number;
}

/**
 * Parses an unknown error response.
 */
function parseUnknownError(status: number, body: unknown): UnknownError {
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : 'Request failed';

  return {
    code: 'UNKNOWN',
    message,
    status,
  };
}

/**
 * Maps an HTTP response to a client domain error.
 *
 * @param status - HTTP status code
 * @param body - Response body
 * @returns Client domain error
 *
 * @example
 * const error = httpToClientError(404, { message: 'User not found' });
 * // { code: 'NOT_FOUND', message: 'User not found', resource: 'user' }
 */
export function httpToClientError(status: number, body: unknown): ApiError | UnknownError {
  // Handle empty bodies
  if (body === null || body === undefined || body === '') {
    return parseUnknownError(status, body);
  }

  // Parse body as object
  if (typeof body !== 'object') {
    return parseUnknownError(status, body);
  }

  const bodyObj = body as Record<string, unknown>;
  const message = typeof bodyObj.message === 'string' ? bodyObj.message : 'Request failed';

  switch (status) {
    case 400:
      // Check if it's a validation error
      if (bodyObj.code === 'VALIDATION_FAILED' || bodyObj.issues) {
        const error: ValidationError = {
          code: 'ValidationError',
          message,
          issues: Array.isArray(bodyObj.issues)
            ? (bodyObj.issues as ValidationError['issues'])
            : undefined,
        };
        return error;
      }
      // Generic 400 - return unknown
      return parseUnknownError(status, body);

    case 401:
      return {
        code: 'Unauthorized',
        message,
      } as UnauthorizedError;

    case 403:
      return {
        code: 'Forbidden',
        message,
      } as ForbiddenError;

    case 404:
      return {
        code: 'NotFound',
        message,
        resource: typeof bodyObj.resource === 'string' ? bodyObj.resource : undefined,
      } as NotFoundError;

    case 409:
      return {
        code: 'Conflict',
        message,
        field: typeof bodyObj.field === 'string' ? bodyObj.field : undefined,
      } as ConflictError;

    case 422:
      // Check if it's a validation error
      if (bodyObj.code === 'VALIDATION_FAILED' || bodyObj.issues) {
        const error: ValidationError = {
          code: 'ValidationError',
          message,
          issues: Array.isArray(bodyObj.issues)
            ? (bodyObj.issues as ValidationError['issues'])
            : undefined,
        };
        return error;
      }
    // Fall through to unknown for other 422s

    case 429:
      return {
        code: 'RATE_LIMITED',
        message,
        retryAfter: typeof bodyObj.retryAfter === 'number' ? bodyObj.retryAfter : undefined,
      } as RateLimitedError;

    case 500:
    case 502:
    case 503:
    case 504:
      return parseUnknownError(status, body);

    default:
      return parseUnknownError(status, body);
  }
}

/**
 * Checks if an error is an UnknownError.
 */
export function isUnknownError(error: ApiError | UnknownError): error is UnknownError {
  return error.code === 'UNKNOWN';
}
