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
