import { describe, expect, it } from 'bun:test';
import {
  type AuthError,
  createAuthValidationError,
  createInvalidCredentialsError,
  createOAuthError,
  createPermissionDeniedError,
  createRateLimitedError,
  createSessionExpiredError,
  createSessionNotFoundError,
  createTokenExpiredError,
  createTokenInvalidError,
  createUserExistsError,
  isAuthValidationError,
  isInvalidCredentialsError,
  isOAuthError,
  isPermissionDeniedError,
  isRateLimitedError,
  isSessionExpiredError,
  isSessionNotFoundError,
  isTokenExpiredError,
  isTokenInvalidError,
  isUserExistsError,
} from '../../domain/auth';

describe('domain/auth', () => {
  describe('InvalidCredentialsError', () => {
    it('creates with default message', () => {
      const error = createInvalidCredentialsError();
      expect(error.code).toBe('INVALID_CREDENTIALS');
      expect(error.message).toBe('Invalid email or password');
    });

    it('creates with custom message', () => {
      const error = createInvalidCredentialsError('Wrong password');
      expect(error.message).toBe('Wrong password');
    });

    it('type guard works', () => {
      const error = createInvalidCredentialsError();
      expect(isInvalidCredentialsError(error)).toBe(true);
      expect(isInvalidCredentialsError(createUserExistsError())).toBe(false);
    });
  });

  describe('UserExistsError', () => {
    it('creates with default message', () => {
      const error = createUserExistsError();
      expect(error.code).toBe('USER_EXISTS');
      expect(error.message).toBe('User already exists');
    });

    it('creates with email', () => {
      const error = createUserExistsError('Email taken', 'test@example.com');
      expect(error.email).toBe('test@example.com');
    });

    it('type guard works', () => {
      const error = createUserExistsError();
      expect(isUserExistsError(error)).toBe(true);
      expect(isUserExistsError(createInvalidCredentialsError())).toBe(false);
    });
  });

  describe('SessionExpiredError', () => {
    it('creates with default message', () => {
      const error = createSessionExpiredError();
      expect(error.code).toBe('SESSION_EXPIRED');
      expect(error.message).toBe('Session has expired');
    });

    it('type guard works', () => {
      const error = createSessionExpiredError();
      expect(isSessionExpiredError(error)).toBe(true);
      expect(isSessionExpiredError(createInvalidCredentialsError())).toBe(false);
    });
  });

  describe('PermissionDeniedError', () => {
    it('creates with default message', () => {
      const error = createPermissionDeniedError();
      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.message).toBe('Permission denied');
    });

    it('creates with resource and action', () => {
      const error = createPermissionDeniedError('Cannot edit', {
        resource: 'post',
        action: 'update',
      });
      expect(error.resource).toBe('post');
      expect(error.action).toBe('update');
    });

    it('type guard works', () => {
      const error = createPermissionDeniedError();
      expect(isPermissionDeniedError(error)).toBe(true);
      expect(isPermissionDeniedError(createInvalidCredentialsError())).toBe(false);
    });
  });

  describe('RateLimitedError', () => {
    it('creates with default message', () => {
      const error = createRateLimitedError();
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.message).toBe('Too many attempts, please try again later');
    });

    it('creates with retryAfter', () => {
      const error = createRateLimitedError('Too many attempts', 60);
      expect(error.retryAfter).toBe(60);
    });

    it('type guard works', () => {
      const error = createRateLimitedError();
      expect(isRateLimitedError(error)).toBe(true);
      expect(isRateLimitedError(createInvalidCredentialsError())).toBe(false);
    });
  });

  describe('AuthValidationError', () => {
    it('creates with field and message', () => {
      const error = createAuthValidationError('Invalid email format', 'email');
      expect(error.code).toBe('AUTH_VALIDATION_ERROR');
      expect(error.message).toBe('Invalid email format');
      expect(error.field).toBe('email');
      expect(error.constraint).toBeUndefined();
    });

    it('creates with constraint', () => {
      const error = createAuthValidationError(
        'Password must be at least 8 characters',
        'password',
        'TOO_SHORT',
      );
      expect(error.field).toBe('password');
      expect(error.constraint).toBe('TOO_SHORT');
    });

    it('type guard works', () => {
      const error = createAuthValidationError('Invalid email', 'email');
      expect(isAuthValidationError(error)).toBe(true);
      expect(isAuthValidationError(createInvalidCredentialsError())).toBe(false);
    });
  });

  describe('SessionNotFoundError', () => {
    it('creates with default message', () => {
      const error = createSessionNotFoundError();
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.message).toBe('Session not found');
    });

    it('creates with custom message', () => {
      const error = createSessionNotFoundError('No such session');
      expect(error.message).toBe('No such session');
    });

    it('type guard returns true for SessionNotFoundError', () => {
      const error = createSessionNotFoundError();
      expect(isSessionNotFoundError(error)).toBe(true);
    });

    it('type guard returns false for other errors', () => {
      expect(isSessionNotFoundError(createInvalidCredentialsError())).toBe(false);
      expect(isSessionNotFoundError(createSessionExpiredError())).toBe(false);
    });
  });

  describe('OAuthError', () => {
    it('creates with correct code and message', () => {
      const error = createOAuthError('Token exchange failed');
      expect(error.code).toBe('OAUTH_ERROR');
      expect(error.message).toBe('Token exchange failed');
    });

    it('creates with provider and reason', () => {
      const error = createOAuthError('Invalid state', 'google', 'invalid_state');
      expect(error.provider).toBe('google');
      expect(error.reason).toBe('invalid_state');
    });

    it('type guard returns true for OAuthError', () => {
      const error = createOAuthError('fail');
      expect(isOAuthError(error)).toBe(true);
    });

    it('type guard returns false for other errors', () => {
      expect(isOAuthError(createInvalidCredentialsError())).toBe(false);
      expect(isOAuthError(createSessionExpiredError())).toBe(false);
    });
  });

  describe('TokenExpiredError', () => {
    it('creates with default message', () => {
      const error = createTokenExpiredError();
      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.message).toBe('Token has expired');
    });

    it('creates with custom message', () => {
      const error = createTokenExpiredError('Verification token expired');
      expect(error.message).toBe('Verification token expired');
    });

    it('type guard returns true for TokenExpiredError', () => {
      const error = createTokenExpiredError();
      expect(isTokenExpiredError(error)).toBe(true);
    });

    it('type guard returns false for other errors', () => {
      expect(isTokenExpiredError(createInvalidCredentialsError())).toBe(false);
      expect(isTokenExpiredError(createSessionExpiredError())).toBe(false);
    });
  });

  describe('TokenInvalidError', () => {
    it('creates with default message', () => {
      const error = createTokenInvalidError();
      expect(error.code).toBe('TOKEN_INVALID');
      expect(error.message).toBe('Invalid token');
    });

    it('creates with custom message', () => {
      const error = createTokenInvalidError('Reset token not found');
      expect(error.message).toBe('Reset token not found');
    });

    it('type guard returns true for TokenInvalidError', () => {
      const error = createTokenInvalidError();
      expect(isTokenInvalidError(error)).toBe(true);
    });

    it('type guard returns false for other errors', () => {
      expect(isTokenInvalidError(createInvalidCredentialsError())).toBe(false);
      expect(isTokenInvalidError(createTokenExpiredError())).toBe(false);
    });
  });

  describe('AuthError union', () => {
    it('accepts all auth error types', () => {
      const errors: AuthError[] = [
        createInvalidCredentialsError(),
        createUserExistsError(),
        createSessionExpiredError(),
        createSessionNotFoundError(),
        createPermissionDeniedError(),
        createRateLimitedError(),
        createAuthValidationError('Invalid email', 'email'),
        createOAuthError('OAuth failed'),
        createTokenExpiredError(),
        createTokenInvalidError(),
      ];

      expect(errors.length).toBe(10);
      expect(errors.every((e) => 'code' in e)).toBe(true);
    });
  });
});
