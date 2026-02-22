import { ValidationException, VertzException } from '@vertz/core';
import { EntityError, isEntityValidationError } from '@vertz/errors';

// ---------------------------------------------------------------------------
// Status code ↔ EDA error code mapping
// ---------------------------------------------------------------------------

const ERROR_CODE_TO_STATUS: Record<string, number> = {
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  Conflict: 409,
  ValidationError: 422,
  InternalError: 500,
  ServiceUnavailable: 503,
};

const STATUS_TO_ERROR_CODE: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  405: 'MethodNotAllowed',
  409: 'Conflict',
  422: 'ValidationError',
  500: 'InternalError',
  503: 'ServiceUnavailable',
};

// ---------------------------------------------------------------------------
// Error result shape
// ---------------------------------------------------------------------------

export interface EntityErrorResult {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  };
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

/**
 * Maps an error to a consistent EDA error response.
 * VertzExceptions are mapped to their status code + a readable error code.
 * EntityErrors from @vertz/errors are mapped by their error code.
 * Unknown errors produce a generic 500 response that never leaks internals.
 */
export function entityErrorHandler(error: unknown): EntityErrorResult {
  // Handle EntityError from @vertz/errors (returned by CRUD Result)
  if (error instanceof EntityError) {
    const status = ERROR_CODE_TO_STATUS[error.code] ?? 500;

    // Only include structured details for validation errors (safe, structured errors).
    const details = isEntityValidationError(error) ? error.errors : undefined;

    return {
      status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(details !== undefined && { details }),
        },
      },
    };
  }

  // Handle VertzException from @vertz/core (thrown by other code)
  if (error instanceof VertzException) {
    const code = STATUS_TO_ERROR_CODE[error.statusCode] ?? 'InternalError';

    // Only include structured details for ValidationException (safe, structured errors).
    // Generic VertzException.details is NOT included to prevent leaking hidden fields
    // or internal state through error responses (SEC-1).
    const details = error instanceof ValidationException ? error.errors : undefined;

    return {
      status: error.statusCode,
      body: {
        error: {
          code,
          message: error.message,
          ...(details !== undefined && { details }),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: { code: 'InternalError', message: 'An unexpected error occurred' },
    },
  };
}
