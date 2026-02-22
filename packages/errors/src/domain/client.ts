/**
 * Client domain errors.
 *
 * These errors are used at the HTTP boundary and use client-native vocabulary
 * (not DB internals). They map from server HTTP responses.
 */

// ============================================================================
// Client Errors
// ============================================================================

/**
 * Validation error (client-facing).
 *
 * Maps from server's VALIDATION_FAILED.
 */
export interface ValidationError {
  readonly code: 'ValidationError';
  readonly message: string;
  readonly issues?: readonly {
    readonly path: readonly (string | number)[];
    readonly message: string;
    readonly code: string;
  }[];
}

/**
 * Creates a ValidationError.
 */
export function createValidationError(
  message: string,
  issues?: readonly {
    readonly path: readonly (string | number)[];
    readonly message: string;
    readonly code: string;
  }[],
): ValidationError {
  return {
    code: 'ValidationError',
    message,
    issues,
  };
}

/**
 * Type guard for ValidationError.
 */
export function isValidationError(error: { readonly code: string }): error is ValidationError {
  return error.code === 'ValidationError';
}

/**
 * Not found error (client-facing).
 *
 * Maps from server's NOT_FOUND.
 */
export interface NotFoundError {
  readonly code: 'NotFound';
  readonly message: string;
  readonly resource?: string;
}

/**
 * Creates a NotFoundError.
 */
export function createNotFoundError(
  message = 'Resource not found',
  resource?: string,
): NotFoundError {
  return {
    code: 'NotFound',
    message,
    resource,
  };
}

/**
 * Type guard for NotFoundError.
 */
export function isNotFoundError(error: { readonly code: string }): error is NotFoundError {
  return error.code === 'NotFound';
}

/**
 * Conflict error (client-facing).
 *
 * Maps from server's UNIQUE_VIOLATION.
 */
export interface ConflictError {
  readonly code: 'Conflict';
  readonly message: string;
  readonly field?: string;
}

/**
 * Creates a ConflictError.
 */
export function createConflictError(message = 'Resource conflict', field?: string): ConflictError {
  return {
    code: 'Conflict',
    message,
    field,
  };
}

/**
 * Type guard for ConflictError.
 */
export function isConflictError(error: { readonly code: string }): error is ConflictError {
  return error.code === 'Conflict';
}

/**
 * Unauthorized error.
 *
 * Returned when the user is not authenticated.
 */
export interface UnauthorizedError {
  readonly code: 'Unauthorized';
  readonly message: string;
}

/**
 * Creates an UnauthorizedError.
 */
export function createUnauthorizedError(message = 'Authentication required'): UnauthorizedError {
  return {
    code: 'Unauthorized',
    message,
  };
}

/**
 * Type guard for UnauthorizedError.
 */
export function isUnauthorizedError(error: { readonly code: string }): error is UnauthorizedError {
  return error.code === 'Unauthorized';
}

/**
 * Forbidden error.
 *
 * Returned when the user is authenticated but not authorized.
 */
export interface ForbiddenError {
  readonly code: 'Forbidden';
  readonly message: string;
}

/**
 * Creates a ForbiddenError.
 */
export function createForbiddenError(message = 'Access denied'): ForbiddenError {
  return {
    code: 'Forbidden',
    message,
  };
}

/**
 * Type guard for ForbiddenError.
 */
export function isForbiddenError(error: { readonly code: string }): error is ForbiddenError {
  return error.code === 'Forbidden';
}

/**
 * Rate limited error (client-facing).
 *
 * Maps from server's RATE_LIMITED.
 */
export interface RateLimitedError {
  readonly code: 'RATE_LIMITED';
  readonly message: string;
  readonly retryAfter?: number;
}

/**
 * Creates a RateLimitedError.
 */
export function createRateLimitedError(
  message = 'Too many requests',
  retryAfter?: number,
): RateLimitedError {
  return {
    code: 'RATE_LIMITED',
    message,
    retryAfter,
  };
}

/**
 * Type guard for RateLimitedError.
 */
export function isRateLimitedError(error: { readonly code: string }): error is RateLimitedError {
  return error.code === 'RATE_LIMITED';
}

// ============================================================================
// Combined Types
// ============================================================================

/**
 * Union type for all client errors.
 *
 * These are the errors that clients receive from API calls.
 */
export type ApiError =
  | ValidationError
  | NotFoundError
  | ConflictError
  | UnauthorizedError
  | ForbiddenError
  | RateLimitedError;
