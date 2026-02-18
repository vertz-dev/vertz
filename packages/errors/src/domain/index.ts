/**
 * Domain error types.
 *
 * These are the errors that represent expected runtime failures
 * in the business logic layer.
 */

// Schema errors - using prefixed names to avoid conflicts
export {
  type ValidationError as SchemaValidationError,
  createValidationError as createSchemaValidationError,
  isValidationError as isSchemaValidationError,
  type ValidationIssue,
} from './schema.js';

// Database errors
export {
  type NotFoundError as DBNotFoundError,
  type UniqueViolation,
  type FKViolation,
  type NotNullViolation,
  type CheckViolation,
  type ReadError,
  type WriteError,
  createNotFoundError as createDBNotFoundError,
  isNotFoundError as isDBNotFoundError,
  createUniqueViolation,
  isUniqueViolation,
  createFKViolation,
  isFKViolation,
  createNotNullViolation,
  isNotNullViolation,
  createCheckViolation,
  isCheckViolation,
} from './db.js';

// Auth errors - using prefixed names to avoid conflicts
export {
  type InvalidCredentialsError,
  type UserExistsError,
  type SessionExpiredError,
  type PermissionDeniedError,
  type RateLimitedError as AuthRateLimitedError,
  type AuthError,
  createInvalidCredentialsError,
  createUserExistsError,
  createSessionExpiredError,
  createPermissionDeniedError,
  createRateLimitedError as createAuthRateLimitedError,
  isInvalidCredentialsError,
  isUserExistsError,
  isSessionExpiredError,
  isPermissionDeniedError,
  isRateLimitedError as isAuthRateLimitedError,
} from './auth.js';

// Client errors
export {
  type ValidationError as ClientValidationError,
  type NotFoundError as ClientNotFoundError,
  type ConflictError,
  type UnauthorizedError,
  type ForbiddenError,
  type RateLimitedError as ClientRateLimitedError,
  type ApiError,
  createValidationError as createClientValidationError,
  isValidationError as isClientValidationError,
  createNotFoundError as createClientNotFoundError,
  isNotFoundError as isClientNotFoundError,
  createConflictError,
  isConflictError,
  createUnauthorizedError,
  isUnauthorizedError,
  createForbiddenError,
  isForbiddenError,
  createRateLimitedError as createClientRateLimitedError,
  isRateLimitedError as isClientRateLimitedError,
} from './client.js';
