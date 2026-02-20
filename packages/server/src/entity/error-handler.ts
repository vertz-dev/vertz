import { ValidationException, VertzException } from '@vertz/core';

// ---------------------------------------------------------------------------
// Status code → EDA error code mapping
// ---------------------------------------------------------------------------

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
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
 * Unknown errors produce a generic 500 response that never leaks internals.
 */
export function entityErrorHandler(error: unknown): EntityErrorResult {
  if (error instanceof VertzException) {
    const code = STATUS_TO_CODE[error.statusCode] ?? 'INTERNAL_ERROR';

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
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    },
  };
}
