/**
 * Entity error classes.
 *
 * These errors mirror server HTTP error codes and are used at the HTTP boundary.
 */

// ============================================================================
// Base class
// ============================================================================

/**
 * Base class for entity errors.
 *
 * @example
 * import { EntityError } from '@ *
 * // Checkvertz/errors';
 error type
 * if (error instanceof EntityError) {
 *   console.log(error.code);  // e.g., 'NOT_FOUND'
 *   console.log(error.message);
 * }
 */
export abstract class EntityError extends Error {
  /**
   * The error code - a string literal for type-safe discrimination.
   */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

// ============================================================================
// BadRequestError (400)
// ============================================================================

/**
 * Bad request error - 400.
 */
export class BadRequestError extends EntityError {
  readonly code = 'BAD_REQUEST' as const;

  constructor(message = 'Bad Request') {
    super('BAD_REQUEST', message);
    this.name = 'BadRequestError';
  }
}

/**
 * Type guard for BadRequestError.
 */
export function isBadRequestError(error: unknown): error is BadRequestError {
  return error instanceof BadRequestError;
}

// ============================================================================
// UnauthorizedError (401)
// ============================================================================

/**
 * Unauthorized error - 401.
 */
export class EntityUnauthorizedError extends EntityError {
  readonly code = 'UNAUTHORIZED' as const;

  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Type guard for EntityUnauthorizedError.
 */
export function isEntityUnauthorizedError(error: unknown): error is EntityUnauthorizedError {
  return error instanceof EntityUnauthorizedError;
}

// ============================================================================
// ForbiddenError (403)
// ============================================================================

/**
 * Forbidden error - 403.
 */
export class EntityForbiddenError extends EntityError {
  readonly code = 'FORBIDDEN' as const;

  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Type guard for EntityForbiddenError.
 */
export function isEntityForbiddenError(error: unknown): error is EntityForbiddenError {
  return error instanceof EntityForbiddenError;
}

// ============================================================================
// NotFoundError (404)
// ============================================================================

/**
 * Not found error - 404.
 *
 * @example
 * // Using in matchError for server-side error handling
 * const result = await db.users.get(userId);
 * if (!result.ok) {
 *   return matchError(result.error, {
 *     NOT_FOUND: (e) => Response.json(
 *       { error: { code: 'NOT_FOUND', message: `User ${userId} not found` } },
 *       { status: 404 }
 *     ),
 *     // ... other handlers
 *   });
 * }
 *
 * @example
 * // With resource info
 * throw new EntityNotFoundError('User not found', 'User', userId);
 */
export class EntityNotFoundError extends EntityError {
  readonly code = 'NOT_FOUND' as const;

  /**
   * The type of resource that wasn't found.
   */
  readonly resource?: string;

  /**
   * The ID of the resource that wasn't found.
   */
  readonly resourceId?: string;

  constructor(message = 'Not Found', resource?: string, resourceId?: string) {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

/**
 * Type guard for EntityNotFoundError.
 */
export function isEntityNotFoundError(error: unknown): error is EntityNotFoundError {
  return error instanceof EntityNotFoundError;
}

// ============================================================================
// MethodNotAllowedError (405)
// ============================================================================

/**
 * Method not allowed error - 405.
 */
export class MethodNotAllowedError extends EntityError {
  readonly code = 'METHOD_NOT_ALLOWED' as const;

  /**
   * Allowed HTTP methods.
   */
  readonly allowedMethods?: string;

  constructor(allowedMethods?: string, message = 'Method Not Allowed') {
    super('METHOD_NOT_ALLOWED', message);
    this.name = 'MethodNotAllowedError';
    this.allowedMethods = allowedMethods;
  }
}

/**
 * Type guard for MethodNotAllowedError.
 */
export function isMethodNotAllowedError(error: unknown): error is MethodNotAllowedError {
  return error instanceof MethodNotAllowedError;
}

// ============================================================================
// ConflictError (409)
// ============================================================================

/**
 * Conflict error - 409.
 */
export class EntityConflictError extends EntityError {
  readonly code = 'CONFLICT' as const;

  /**
   * The field that caused the conflict.
   */
  readonly field?: string;

  constructor(message = 'Conflict', field?: string) {
    super('CONFLICT', message);
    this.name = 'ConflictError';
    this.field = field;
  }
}

/**
 * Type guard for EntityConflictError.
 */
export function isEntityConflictError(error: unknown): error is EntityConflictError {
  return error instanceof EntityConflictError;
}

// ============================================================================
// EntityValidationError (422)
// ============================================================================

/**
 * Entity validation error - 422.
 *
 * @example
 * // Server-side: throwing validation errors
 * throw new EntityValidationError([
 *   { path: ['email'], message: 'Invalid email format', code: 'INVALID_FORMAT' },
 *   { path: ['age'], message: 'Must be positive', code: 'MIN_VALUE' },
 * ]);
 *
 * @example
 * // Server-side: handling in HTTP response
 * if (!result.ok) {
 *   return matchError(result.error, {
 *     ENTITY_VALIDATION_ERROR: (e) => Response.json(
 *       { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', errors: e.errors } },
 *       { status: 422 }
 *     ),
 *     // ... other handlers
 *   });
 * }
 */
export class EntityValidationError extends EntityError {
  readonly code = 'ENTITY_VALIDATION_ERROR' as const;

  /**
   * Validation errors.
   */
  readonly errors: readonly {
    readonly path: readonly (string | number)[];
    readonly message: string;
    readonly code: string;
  }[];

  constructor(
    errors: readonly {
      readonly path: readonly (string | number)[];
      readonly message: string;
      readonly code: string;
    }[],
  ) {
    super('ENTITY_VALIDATION_ERROR', 'Validation failed');
    this.name = 'EntityValidationError';
    this.errors = errors;
  }
}

/**
 * Type guard for EntityValidationError.
 */
export function isEntityValidationError(error: unknown): error is EntityValidationError {
  return error instanceof EntityValidationError;
}

// ============================================================================
// InternalError (500)
// ============================================================================

/**
 * Internal server error - 500.
 */
export class InternalError extends EntityError {
  readonly code = 'INTERNAL_ERROR' as const;

  constructor(message = 'Internal Server Error') {
    super('INTERNAL_ERROR', message);
    this.name = 'InternalError';
  }
}

/**
 * Type guard for InternalError.
 */
export function isInternalError(error: unknown): error is InternalError {
  return error instanceof InternalError;
}

// ============================================================================
// ServiceUnavailableError (503)
// ============================================================================

/**
 * Service unavailable error - 503.
 */
export class ServiceUnavailableError extends EntityError {
  readonly code = 'SERVICE_UNAVAILABLE' as const;

  /**
   * Seconds until retry.
   */
  readonly retryAfter?: number;

  constructor(message = 'Service Unavailable', retryAfter?: number) {
    super('SERVICE_UNAVAILABLE', message);
    this.name = 'ServiceUnavailableError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Type guard for ServiceUnavailableError.
 */
export function isServiceUnavailableError(error: unknown): error is ServiceUnavailableError {
  return error instanceof ServiceUnavailableError;
}

// ============================================================================
// Union types
// ============================================================================

/**
 * Union type for all entity errors.
 *
 * @example
 * import { matchError, EntityErrorType } from '@vertz/errors';
 *
 * // Server-side: handling database errors
 * const result = await db.users.create(data);
 * if (!result.ok) {
 *   return matchError(result.error, {
 *     BAD_REQUEST: (e) => Response.json({ error: e.message }, { status: 400 }),
 *     UNAUTHORIZED: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
 *     FORBIDDEN: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
 *     NOT_FOUND: (e) => Response.json({ error: e.message }, { status: 404 }),
 *     METHOD_NOT_ALLOWED: () => Response.json({ error: 'Method not allowed' }, { status: 405 }),
 *     CONFLICT: (e) => Response.json({ error: e.message }, { status: 409 }),
 *     ENTITY_VALIDATION_ERROR: (e) => Response.json({ error: e.errors }, { status: 422 }),
 *     INTERNAL_ERROR: () => Response.json({ error: 'Internal error' }, { status: 500 }),
 *     SERVICE_UNAVAILABLE: () => Response.json({ error: 'Service unavailable' }, { status: 503 }),
 *   });
 * }
 */
export type EntityErrorType =
  | BadRequestError
  | EntityUnauthorizedError
  | EntityForbiddenError
  | EntityNotFoundError
  | MethodNotAllowedError
  | EntityConflictError
  | EntityValidationError
  | InternalError
  | ServiceUnavailableError;
