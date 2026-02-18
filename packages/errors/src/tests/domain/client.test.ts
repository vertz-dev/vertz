import { describe, it, expect } from 'vitest';
import {
  createValidationError,
  isValidationError,
  createNotFoundError,
  isNotFoundError,
  createConflictError,
  isConflictError,
  createUnauthorizedError,
  isUnauthorizedError,
  createForbiddenError,
  isForbiddenError,
  createRateLimitedError,
  isRateLimitedError,
  type ApiError,
} from '../../domain/client';

describe('domain/client', () => {
  describe('ValidationError', () => {
    it('creates a ValidationError', () => {
      const error = createValidationError('Validation failed', [
        { path: ['email'], message: 'Invalid email', code: 'invalid' },
      ]);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.issues).toHaveLength(1);
      expect(error.issues?.[0].path).toEqual(['email']);
    });

    it('type guard works', () => {
      const error = createValidationError('Failed');
      expect(isValidationError(error)).toBe(true);
      expect(isValidationError(createNotFoundError())).toBe(false);
    });
  });

  describe('NotFoundError', () => {
    it('creates with default message', () => {
      const error = createNotFoundError();
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
    });

    it('creates with resource', () => {
      const error = createNotFoundError('User not found', 'user');
      expect(error.resource).toBe('user');
    });

    it('type guard works', () => {
      const error = createNotFoundError();
      expect(isNotFoundError(error)).toBe(true);
      expect(isNotFoundError(createValidationError('Failed'))).toBe(false);
    });
  });

  describe('ConflictError', () => {
    it('creates with default message', () => {
      const error = createConflictError();
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Resource conflict');
    });

    it('creates with field', () => {
      const error = createConflictError('Email already exists', 'email');
      expect(error.field).toBe('email');
    });

    it('type guard works', () => {
      const error = createConflictError();
      expect(isConflictError(error)).toBe(true);
      expect(isConflictError(createNotFoundError())).toBe(false);
    });
  });

  describe('UnauthorizedError', () => {
    it('creates with default message', () => {
      const error = createUnauthorizedError();
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Authentication required');
    });

    it('type guard works', () => {
      const error = createUnauthorizedError();
      expect(isUnauthorizedError(error)).toBe(true);
      expect(isUnauthorizedError(createForbiddenError())).toBe(false);
    });
  });

  describe('ForbiddenError', () => {
    it('creates with default message', () => {
      const error = createForbiddenError();
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Access denied');
    });

    it('type guard works', () => {
      const error = createForbiddenError();
      expect(isForbiddenError(error)).toBe(true);
      expect(isForbiddenError(createUnauthorizedError())).toBe(false);
    });
  });

  describe('RateLimitedError', () => {
    it('creates with default message', () => {
      const error = createRateLimitedError();
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.message).toBe('Too many requests');
    });

    it('creates with retryAfter', () => {
      const error = createRateLimitedError('Slow down', 60);
      expect(error.retryAfter).toBe(60);
    });

    it('type guard works', () => {
      const error = createRateLimitedError();
      expect(isRateLimitedError(error)).toBe(true);
      expect(isRateLimitedError(createForbiddenError())).toBe(false);
    });
  });

  describe('ApiError union', () => {
    it('accepts all client error types', () => {
      const errors: ApiError[] = [
        createValidationError('Failed'),
        createNotFoundError(),
        createConflictError(),
        createUnauthorizedError(),
        createForbiddenError(),
        createRateLimitedError(),
      ];

      expect(errors.length).toBe(6);
    });
  });
});
