/**
 * Domain error types.
 *
 * These are the errors that represent expected runtime failures
 * in the business logic layer.
 */

// Auth errors - using prefixed names to avoid conflicts
export {
  type AuthError,
  createInvalidCredentialsError,
  createPermissionDeniedError,
  createRateLimitedError as createAuthRateLimitedError,
  createSessionExpiredError,
  createUserExistsError,
  type InvalidCredentialsError,
  isInvalidCredentialsError,
  isPermissionDeniedError,
  isRateLimitedError as isAuthRateLimitedError,
  isSessionExpiredError,
  isUserExistsError,
  type PermissionDeniedError,
  type RateLimitedError as AuthRateLimitedError,
  type SessionExpiredError,
  type UserExistsError,
} from './auth.js';
// Client errors
export {
  type ApiError,
  type ConflictError,
  createConflictError,
  createForbiddenError,
  createNotFoundError as createClientNotFoundError,
  createRateLimitedError as createClientRateLimitedError,
  createUnauthorizedError,
  createValidationError as createClientValidationError,
  type ForbiddenError,
  isConflictError,
  isForbiddenError,
  isNotFoundError as isClientNotFoundError,
  isRateLimitedError as isClientRateLimitedError,
  isUnauthorizedError,
  isValidationError as isClientValidationError,
  type NotFoundError as ClientNotFoundError,
  type RateLimitedError as ClientRateLimitedError,
  type UnauthorizedError,
  type ValidationError as ClientValidationError,
} from './client.js';
// Database errors
export {
  type CheckViolation,
  createCheckViolation,
  createFKViolation,
  createNotFoundError as createDBNotFoundError,
  createNotNullViolation,
  createUniqueViolation,
  type FKViolation,
  isCheckViolation,
  isFKViolation,
  isNotFoundError as isDBNotFoundError,
  isNotNullViolation,
  isUniqueViolation,
  type NotFoundError as DBNotFoundError,
  type NotNullViolation,
  type ReadError,
  type UniqueViolation,
  type WriteError,
} from './db.js';
// Schema errors - using prefixed names to avoid conflicts
export {
  createValidationError as createSchemaValidationError,
  isValidationError as isSchemaValidationError,
  type ValidationError as SchemaValidationError,
  type ValidationIssue,
} from './schema.js';
