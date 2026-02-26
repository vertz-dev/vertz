/**
 * Authentication and authorization domain errors.
 *
 * These errors are returned from auth operations.
 */

// ============================================================================
// Auth Errors
// ============================================================================

/**
 * Invalid credentials error.
 *
 * Returned when authentication fails due to wrong email/password.
 */
export interface InvalidCredentialsError {
  readonly code: 'INVALID_CREDENTIALS';
  readonly message: string;
}

/**
 * Creates an InvalidCredentialsError.
 */
export function createInvalidCredentialsError(
  message = 'Invalid email or password',
): InvalidCredentialsError {
  return {
    code: 'INVALID_CREDENTIALS',
    message,
  };
}

/**
 * Type guard for InvalidCredentialsError.
 */
export function isInvalidCredentialsError(error: {
  readonly code: string;
}): error is InvalidCredentialsError {
  return error.code === 'INVALID_CREDENTIALS';
}

/**
 * User already exists error.
 *
 * Returned when attempting to sign up with an existing email.
 */
export interface UserExistsError {
  readonly code: 'USER_EXISTS';
  readonly message: string;
  readonly email?: string;
}

/**
 * Creates a UserExistsError.
 */
export function createUserExistsError(
  message = 'User already exists',
  email?: string,
): UserExistsError {
  return {
    code: 'USER_EXISTS',
    message,
    email,
  };
}

/**
 * Type guard for UserExistsError.
 */
export function isUserExistsError(error: { readonly code: string }): error is UserExistsError {
  return error.code === 'USER_EXISTS';
}

/**
 * Session expired error.
 *
 * Returned when a token is no longer valid (expired, revoked, etc.).
 */
export interface SessionExpiredError {
  readonly code: 'SESSION_EXPIRED';
  readonly message: string;
}

/**
 * Creates a SessionExpiredError.
 */
export function createSessionExpiredError(message = 'Session has expired'): SessionExpiredError {
  return {
    code: 'SESSION_EXPIRED',
    message,
  };
}

/**
 * Type guard for SessionExpiredError.
 */
export function isSessionExpiredError(error: {
  readonly code: string;
}): error is SessionExpiredError {
  return error.code === 'SESSION_EXPIRED';
}

/**
 * Permission denied error.
 *
 * Returned when authenticated but not authorized to perform an action.
 */
export interface PermissionDeniedError {
  readonly code: 'PERMISSION_DENIED';
  readonly message: string;
  readonly resource?: string;
  readonly action?: string;
}

/**
 * Creates a PermissionDeniedError.
 */
export function createPermissionDeniedError(
  message = 'Permission denied',
  options?: { resource?: string; action?: string },
): PermissionDeniedError {
  return {
    code: 'PERMISSION_DENIED',
    message,
    ...options,
  };
}

/**
 * Type guard for PermissionDeniedError.
 */
export function isPermissionDeniedError(error: {
  readonly code: string;
}): error is PermissionDeniedError {
  return error.code === 'PERMISSION_DENIED';
}

/**
 * Rate limited error.
 *
 * Returned when too many attempts have been made.
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
  message = 'Too many attempts, please try again later',
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
// Auth Validation Errors
// ============================================================================

/**
 * Auth validation error.
 *
 * Returned when auth input fails validation (invalid email, weak password, etc.).
 */
export interface AuthValidationError {
  readonly code: 'AUTH_VALIDATION_ERROR';
  readonly message: string;
  readonly field: 'email' | 'password';
  readonly constraint?: string;
}

/**
 * Creates an AuthValidationError.
 */
export function createAuthValidationError(
  message: string,
  field: 'email' | 'password',
  constraint?: string,
): AuthValidationError {
  return {
    code: 'AUTH_VALIDATION_ERROR',
    message,
    field,
    ...(constraint !== undefined ? { constraint } : {}),
  };
}

/**
 * Type guard for AuthValidationError.
 */
export function isAuthValidationError(error: {
  readonly code: string;
}): error is AuthValidationError {
  return error.code === 'AUTH_VALIDATION_ERROR';
}

// ============================================================================
// Combined Types
// ============================================================================

/**
 * Union type for all auth errors.
 */
export type AuthError =
  | InvalidCredentialsError
  | UserExistsError
  | SessionExpiredError
  | PermissionDeniedError
  | RateLimitedError
  | AuthValidationError;
