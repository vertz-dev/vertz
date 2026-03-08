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
// Session Not Found
// ============================================================================

/**
 * Session not found error.
 *
 * Returned when a session ID doesn't exist or doesn't belong to the user.
 */
export interface SessionNotFoundError {
  readonly code: 'SESSION_NOT_FOUND';
  readonly message: string;
}

/**
 * Creates a SessionNotFoundError.
 */
export function createSessionNotFoundError(message = 'Session not found'): SessionNotFoundError {
  return {
    code: 'SESSION_NOT_FOUND',
    message,
  };
}

/**
 * Type guard for SessionNotFoundError.
 */
export function isSessionNotFoundError(error: {
  readonly code: string;
}): error is SessionNotFoundError {
  return error.code === 'SESSION_NOT_FOUND';
}

// ============================================================================
// OAuth Error
// ============================================================================

/**
 * OAuth error.
 *
 * Returned when an OAuth operation fails (provider not configured, invalid state, etc.).
 */
export interface OAuthError {
  readonly code: 'OAUTH_ERROR';
  readonly message: string;
  readonly provider?: string;
  readonly reason?:
    | 'provider_not_configured'
    | 'invalid_state'
    | 'token_exchange_failed'
    | 'user_info_failed'
    | 'account_already_linked'
    | 'cannot_unlink_last_method';
}

/**
 * Creates an OAuthError.
 */
export function createOAuthError(
  message: string,
  provider?: string,
  reason?: OAuthError['reason'],
): OAuthError {
  return {
    code: 'OAUTH_ERROR',
    message,
    provider,
    reason,
  };
}

/**
 * Type guard for OAuthError.
 */
export function isOAuthError(error: { readonly code: string }): error is OAuthError {
  return error.code === 'OAUTH_ERROR';
}

// ============================================================================
// MFA Errors
// ============================================================================

/**
 * MFA required error.
 *
 * Returned when sign-in succeeds but MFA verification is needed.
 */
export interface MfaRequiredError {
  readonly code: 'MFA_REQUIRED';
  readonly message: string;
}

/**
 * Creates an MfaRequiredError.
 */
export function createMfaRequiredError(message = 'MFA verification required'): MfaRequiredError {
  return {
    code: 'MFA_REQUIRED',
    message,
  };
}

/**
 * Type guard for MfaRequiredError.
 */
export function isMfaRequiredError(error: { readonly code: string }): error is MfaRequiredError {
  return error.code === 'MFA_REQUIRED';
}

/**
 * MFA invalid code error.
 *
 * Returned when an MFA code (TOTP or backup) is incorrect.
 */
export interface MfaInvalidCodeError {
  readonly code: 'MFA_INVALID_CODE';
  readonly message: string;
  readonly attemptsRemaining?: number;
}

/**
 * Creates an MfaInvalidCodeError.
 */
export function createMfaInvalidCodeError(
  message = 'Invalid MFA code',
  attemptsRemaining?: number,
): MfaInvalidCodeError {
  return {
    code: 'MFA_INVALID_CODE',
    message,
    attemptsRemaining,
  };
}

/**
 * Type guard for MfaInvalidCodeError.
 */
export function isMfaInvalidCodeError(error: {
  readonly code: string;
}): error is MfaInvalidCodeError {
  return error.code === 'MFA_INVALID_CODE';
}

/**
 * MFA already enabled error.
 *
 * Returned when trying to enable MFA on an account that already has it.
 */
export interface MfaAlreadyEnabledError {
  readonly code: 'MFA_ALREADY_ENABLED';
  readonly message: string;
}

/**
 * Creates an MfaAlreadyEnabledError.
 */
export function createMfaAlreadyEnabledError(
  message = 'MFA is already enabled',
): MfaAlreadyEnabledError {
  return {
    code: 'MFA_ALREADY_ENABLED',
    message,
  };
}

/**
 * Type guard for MfaAlreadyEnabledError.
 */
export function isMfaAlreadyEnabledError(error: {
  readonly code: string;
}): error is MfaAlreadyEnabledError {
  return error.code === 'MFA_ALREADY_ENABLED';
}

/**
 * MFA not enabled error.
 *
 * Returned when trying to disable MFA or regenerate backup codes when MFA is not enabled.
 */
export interface MfaNotEnabledError {
  readonly code: 'MFA_NOT_ENABLED';
  readonly message: string;
}

/**
 * Creates an MfaNotEnabledError.
 */
export function createMfaNotEnabledError(message = 'MFA is not enabled'): MfaNotEnabledError {
  return {
    code: 'MFA_NOT_ENABLED',
    message,
  };
}

/**
 * Type guard for MfaNotEnabledError.
 */
export function isMfaNotEnabledError(error: {
  readonly code: string;
}): error is MfaNotEnabledError {
  return error.code === 'MFA_NOT_ENABLED';
}

// ============================================================================
// Token Expired Error
// ============================================================================

/**
 * Token expired error.
 *
 * Returned when a verification or reset token has expired.
 */
export interface TokenExpiredError {
  readonly code: 'TOKEN_EXPIRED';
  readonly message: string;
}

/**
 * Creates a TokenExpiredError.
 */
export function createTokenExpiredError(message = 'Token has expired'): TokenExpiredError {
  return {
    code: 'TOKEN_EXPIRED',
    message,
  };
}

/**
 * Type guard for TokenExpiredError.
 */
export function isTokenExpiredError(error: { readonly code: string }): error is TokenExpiredError {
  return error.code === 'TOKEN_EXPIRED';
}

// ============================================================================
// Token Invalid Error
// ============================================================================

/**
 * Token invalid error.
 *
 * Returned when a verification or reset token is invalid or not found.
 */
export interface TokenInvalidError {
  readonly code: 'TOKEN_INVALID';
  readonly message: string;
}

/**
 * Creates a TokenInvalidError.
 */
export function createTokenInvalidError(message = 'Invalid token'): TokenInvalidError {
  return {
    code: 'TOKEN_INVALID',
    message,
  };
}

/**
 * Type guard for TokenInvalidError.
 */
export function isTokenInvalidError(error: { readonly code: string }): error is TokenInvalidError {
  return error.code === 'TOKEN_INVALID';
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
  | SessionNotFoundError
  | PermissionDeniedError
  | RateLimitedError
  | AuthValidationError
  | OAuthError
  | MfaRequiredError
  | MfaInvalidCodeError
  | MfaAlreadyEnabledError
  | MfaNotEnabledError
  | TokenExpiredError
  | TokenInvalidError;
