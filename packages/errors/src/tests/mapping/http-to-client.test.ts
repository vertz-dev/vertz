import { describe, it, expect } from 'vitest';
import { httpToClientError, isUnknownError } from '../../mapping/http-to-client';
import { createValidationError, createNotFoundError, createConflictError, createUnauthorizedError, createForbiddenError, createRateLimitedError } from '../../domain/client';

describe('mapping/http-to-client', () => {
  describe('httpToClientError()', () => {
    describe('400 Bad Request', () => {
      it('maps validation error', () => {
        const body = {
          code: 'VALIDATION_FAILED',
          message: 'Invalid input',
          issues: [{ path: ['email'], message: 'Invalid', code: 'invalid' }],
        };
        const error = httpToClientError(400, body);
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.message).toBe('Invalid input');
        expect((error as ReturnType<typeof createValidationError>).issues).toHaveLength(1);
      });

      it('maps generic 400', () => {
        const error = httpToClientError(400, { message: 'Bad request' });
        expect(error.code).toBe('UNKNOWN');
        expect(error.message).toBe('Bad request');
      });
    });

    describe('401 Unauthorized', () => {
      it('maps to UNAUTHORIZED', () => {
        const error = httpToClientError(401, { message: 'Not authenticated' });
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe('Not authenticated');
      });
    });

    describe('403 Forbidden', () => {
      it('maps to FORBIDDEN', () => {
        const error = httpToClientError(403, { message: 'Access denied' });
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toBe('Access denied');
      });
    });

    describe('404 Not Found', () => {
      it('maps to NOT_FOUND', () => {
        const error = httpToClientError(404, { message: 'User not found', resource: 'user' });
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toBe('User not found');
        expect((error as ReturnType<typeof createNotFoundError>).resource).toBe('user');
      });
    });

    describe('409 Conflict', () => {
      it('maps to CONFLICT', () => {
        const error = httpToClientError(409, { message: 'Email taken', field: 'email' });
        expect(error.code).toBe('CONFLICT');
        expect(error.message).toBe('Email taken');
        expect((error as ReturnType<typeof createConflictError>).field).toBe('email');
      });
    });

    describe('422 Unprocessable Entity', () => {
      it('maps validation error from 422', () => {
        const body = {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          issues: [],
        };
        const error = httpToClientError(422, body);
        expect(error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('429 Rate Limited', () => {
      it('maps to RATE_LIMITED', () => {
        const error = httpToClientError(429, { message: 'Too many requests', retryAfter: 60 });
        expect(error.code).toBe('RATE_LIMITED');
        expect((error as ReturnType<typeof createRateLimitedError>).retryAfter).toBe(60);
      });
    });

    describe('5xx errors', () => {
      it('maps 500 to UNKNOWN', () => {
        const error = httpToClientError(500, { message: 'Internal server error' });
        expect(error.code).toBe('UNKNOWN');
        expect((error as { status: number }).status).toBe(500);
      });

      it('maps 503 to UNKNOWN', () => {
        const error = httpToClientError(503, { message: 'Service unavailable' });
        expect(error.code).toBe('UNKNOWN');
      });
    });

    describe('edge cases', () => {
      it('handles null body', () => {
        const error = httpToClientError(500, null);
        expect(error.code).toBe('UNKNOWN');
      });

      it('handles empty string body', () => {
        const error = httpToClientError(500, '');
        expect(error.code).toBe('UNKNOWN');
      });

      it('handles non-object body', () => {
        const error = httpToClientError(500, 'Server error');
        expect(error.code).toBe('UNKNOWN');
      });

      it('handles body without message', () => {
        const error = httpToClientError(404, {});
        expect(error.message).toBe('Request failed');
      });
    });
  });

  describe('isUnknownError()', () => {
    it('returns true for unknown error', () => {
      const error = httpToClientError(500, { message: 'Error' });
      expect(isUnknownError(error)).toBe(true);
    });

    it('returns false for known error', () => {
      const error = httpToClientError(404, { message: 'Not found' });
      expect(isUnknownError(error)).toBe(false);
    });
  });
});
