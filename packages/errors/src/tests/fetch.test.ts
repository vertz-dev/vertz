/**
 * Tests for FetchError classes.
 */

import { describe, it, expect } from 'vitest';
import {
  FetchNetworkError,
  HttpError,
  FetchBadRequestError,
  FetchUnauthorizedError,
  FetchForbiddenError,
  FetchNotFoundError,
  FetchConflictError,
  FetchGoneError,
  FetchUnprocessableEntityError,
  FetchRateLimitError,
  FetchInternalServerError,
  FetchServiceUnavailableError,
  FetchTimeoutError,
  ParseError,
  FetchValidationError,
  isFetchNetworkError,
  isHttpError,
  isFetchBadRequestError,
  isFetchUnauthorizedError,
  isFetchForbiddenError,
  isFetchNotFoundError,
  isFetchConflictError,
  isFetchGoneError,
  isFetchUnprocessableEntityError,
  isFetchRateLimitError,
  isFetchInternalServerError,
  isFetchServiceUnavailableError,
  isFetchTimeoutError,
  isParseError,
  isFetchValidationError,
  createHttpError,
} from '../fetch.js';

describe('FetchError classes', () => {
  describe('FetchNetworkError', () => {
    it('should create a FetchNetworkError with default message', () => {
      const error = new FetchNetworkError();
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network request failed');
      expect(error.code).toBe('NetworkError');
    });

    it('should create a FetchNetworkError with custom message', () => {
      const error = new FetchNetworkError('Connection refused');
      expect(error.message).toBe('Connection refused');
      expect(error.code).toBe('NetworkError');
    });

    it('should have code as readonly literal', () => {
      const error = new FetchNetworkError();
      // TypeScript should enforce this is 'NetworkError'
      const code: 'NetworkError' = error.code;
      expect(code).toBe('NetworkError');
    });
  });

  describe('HttpError', () => {
    it('should create an HttpError with status and message', () => {
      const error = new HttpError(404, 'Not Found');
      expect(error.name).toBe('HttpError');
      expect(error.status).toBe(404);
      expect(error.message).toBe('Not Found');
      expect(error.code).toBe('HttpError');
    });

    it('should create an HttpError with serverCode', () => {
      const error = new HttpError(400, 'Bad Request', 'VALIDATION_FAILED');
      expect(error.serverCode).toBe('VALIDATION_FAILED');
    });

    it('should have serverCode as optional field', () => {
      const error = new HttpError(500, 'Internal Server Error');
      expect(error.serverCode).toBeUndefined();
    });
  });

  describe('FetchTimeoutError', () => {
    it('should create a FetchTimeoutError with default message', () => {
      const error = new FetchTimeoutError();
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Request timed out');
      expect(error.code).toBe('TimeoutError');
    });

    it('should create a FetchTimeoutError with custom message', () => {
      const error = new FetchTimeoutError('Operation took too long');
      expect(error.message).toBe('Operation took too long');
    });
  });

  describe('ParseError', () => {
    it('should create a ParseError with path and message', () => {
      const error = new ParseError('user.name', 'Invalid format');
      expect(error.name).toBe('ParseError');
      expect(error.path).toBe('user.name');
      expect(error.message).toBe('Invalid format');
      expect(error.code).toBe('ParseError');
    });

    it('should create a ParseError with optional value', () => {
      const error = new ParseError('data', 'Unexpected type', { foo: 'bar' });
      expect(error.value).toEqual({ foo: 'bar' });
    });
  });

  describe('FetchValidationError', () => {
    it('should create a FetchValidationError with errors array', () => {
      const errors = [
        { path: 'email', message: 'Invalid email' },
        { path: 'age', message: 'Must be positive' },
      ];
      const error = new FetchValidationError('Validation failed', errors);
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toEqual(errors);
      expect(error.code).toBe('ValidationError');
    });

    it('should create a FetchValidationError with message', () => {
      const errors = [{ path: 'email', message: 'Invalid' }];
      const error = new FetchValidationError('Validation failed', errors);
      expect(error.message).toBe('Validation failed');
    });
  });

  describe('FetchGoneError (410)', () => {
    it('should create a FetchGoneError with message', () => {
      const error = new FetchGoneError('Resource no longer available');
      expect(error.name).toBe('FetchGoneError');
      expect(error.status).toBe(410);
      expect(error.message).toBe('Resource no longer available');
      expect(error.code).toBe('HttpError');
    });

    it('should create a FetchGoneError with serverCode', () => {
      const error = new FetchGoneError('Gone', 'RESOURCE_DELETED');
      expect(error.serverCode).toBe('RESOURCE_DELETED');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchGoneError('Gone');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchUnprocessableEntityError (422)', () => {
    it('should create a FetchUnprocessableEntityError with message', () => {
      const error = new FetchUnprocessableEntityError('Invalid data');
      expect(error.name).toBe('FetchUnprocessableEntityError');
      expect(error.status).toBe(422);
      expect(error.message).toBe('Invalid data');
      expect(error.code).toBe('HttpError');
    });

    it('should create a FetchUnprocessableEntityError with serverCode', () => {
      const error = new FetchUnprocessableEntityError('Invalid', 'VALIDATION_FAILED');
      expect(error.serverCode).toBe('VALIDATION_FAILED');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchUnprocessableEntityError('Invalid');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('Type guards', () => {
    it('should correctly identify FetchNetworkError', () => {
      const error = new FetchNetworkError();
      expect(isFetchNetworkError(error)).toBe(true);
      expect(isFetchNetworkError(new HttpError(404, 'Not Found'))).toBe(false);
    });

    it('should correctly identify HttpError', () => {
      const error = new HttpError(500, 'Error');
      expect(isHttpError(error)).toBe(true);
      expect(isHttpError(new FetchNetworkError())).toBe(false);
    });

    it('should correctly identify FetchTimeoutError', () => {
      const error = new FetchTimeoutError();
      expect(isFetchTimeoutError(error)).toBe(true);
      expect(isFetchTimeoutError(new FetchNetworkError())).toBe(false);
    });

    it('should correctly identify ParseError', () => {
      const error = new ParseError('path', 'msg');
      expect(isParseError(error)).toBe(true);
      expect(isParseError(new FetchNetworkError())).toBe(false);
    });

    it('should correctly identify FetchValidationError', () => {
      const error = new FetchValidationError('Validation failed', []);
      expect(isFetchValidationError(error)).toBe(true);
      expect(isFetchValidationError(new FetchNetworkError())).toBe(false);
    });

    it('should correctly identify FetchGoneError (410)', () => {
      const error = new FetchGoneError('Resource gone');
      expect(error.status).toBe(410);
      expect(error.name).toBe('FetchGoneError');
      expect(isFetchGoneError(error)).toBe(true);
      expect(isFetchGoneError(new FetchUnprocessableEntityError('Invalid'))).toBe(false);
    });

    it('should correctly identify FetchUnprocessableEntityError (422)', () => {
      const error = new FetchUnprocessableEntityError('Invalid data');
      expect(error.status).toBe(422);
      expect(error.name).toBe('FetchUnprocessableEntityError');
      expect(isFetchUnprocessableEntityError(error)).toBe(true);
      expect(isFetchUnprocessableEntityError(new FetchGoneError('Gone'))).toBe(false);
    });
  });

  describe('FetchBadRequestError (400)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchBadRequestError('Invalid input');
      expect(error.status).toBe(400);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchBadRequestError');
      expect(error.message).toBe('Invalid input');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchBadRequestError('Bad', 'MISSING_FIELD');
      expect(error.serverCode).toBe('MISSING_FIELD');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchBadRequestError('Bad');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchUnauthorizedError (401)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchUnauthorizedError('Unauthorized');
      expect(error.status).toBe(401);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchUnauthorizedError');
      expect(error.message).toBe('Unauthorized');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchUnauthorizedError('Auth failed', 'TOKEN_EXPIRED');
      expect(error.serverCode).toBe('TOKEN_EXPIRED');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchUnauthorizedError('Unauthorized');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchForbiddenError (403)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchForbiddenError('Access denied');
      expect(error.status).toBe(403);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchForbiddenError');
      expect(error.message).toBe('Access denied');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchForbiddenError('Forbidden', 'INSUFFICIENT_PERMISSIONS');
      expect(error.serverCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchForbiddenError('Forbidden');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchNotFoundError (404)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchNotFoundError('Resource not found');
      expect(error.status).toBe(404);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchNotFoundError');
      expect(error.message).toBe('Resource not found');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchNotFoundError('Not found', 'USER_NOT_FOUND');
      expect(error.serverCode).toBe('USER_NOT_FOUND');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchNotFoundError('Not found');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchConflictError (409)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchConflictError('Resource conflict');
      expect(error.status).toBe(409);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchConflictError');
      expect(error.message).toBe('Resource conflict');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchConflictError('Conflict', 'DUPLICATE_EMAIL');
      expect(error.serverCode).toBe('DUPLICATE_EMAIL');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchConflictError('Conflict');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchRateLimitError (429)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchRateLimitError('Too many requests');
      expect(error.status).toBe(429);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchRateLimitError');
      expect(error.message).toBe('Too many requests');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchRateLimitError('Rate limited', 'RATE_LIMIT_EXCEEDED');
      expect(error.serverCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchRateLimitError('Too many requests');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchInternalServerError (500)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchInternalServerError('Server crashed');
      expect(error.status).toBe(500);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchInternalServerError');
      expect(error.message).toBe('Server crashed');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchInternalServerError('Error', 'INTERNAL_ERROR');
      expect(error.serverCode).toBe('INTERNAL_ERROR');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchInternalServerError('Server crashed');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('FetchServiceUnavailableError (503)', () => {
    it('should set status, code, name, and message', () => {
      const error = new FetchServiceUnavailableError('Service down');
      expect(error.status).toBe(503);
      expect(error.code).toBe('HttpError');
      expect(error.name).toBe('FetchServiceUnavailableError');
      expect(error.message).toBe('Service down');
    });

    it('should pass serverCode through to HttpError', () => {
      const error = new FetchServiceUnavailableError('Unavailable', 'MAINTENANCE_MODE');
      expect(error.serverCode).toBe('MAINTENANCE_MODE');
    });

    it('should be an instance of HttpError', () => {
      const error = new FetchServiceUnavailableError('Service down');
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe('Type guards for untested subclasses', () => {
    it('should correctly identify FetchBadRequestError (400)', () => {
      expect(isFetchBadRequestError(new FetchBadRequestError('Bad'))).toBe(true);
      expect(isFetchBadRequestError(new FetchUnauthorizedError('Unauthorized'))).toBe(false);
    });

    it('should correctly identify FetchUnauthorizedError (401)', () => {
      expect(isFetchUnauthorizedError(new FetchUnauthorizedError('Unauthorized'))).toBe(true);
      expect(isFetchUnauthorizedError(new FetchBadRequestError('Bad'))).toBe(false);
    });

    it('should correctly identify FetchForbiddenError (403)', () => {
      expect(isFetchForbiddenError(new FetchForbiddenError('Forbidden'))).toBe(true);
      expect(isFetchForbiddenError(new FetchUnauthorizedError('Unauthorized'))).toBe(false);
    });

    it('should correctly identify FetchNotFoundError (404)', () => {
      expect(isFetchNotFoundError(new FetchNotFoundError('Not found'))).toBe(true);
      expect(isFetchNotFoundError(new FetchForbiddenError('Forbidden'))).toBe(false);
    });

    it('should correctly identify FetchConflictError (409)', () => {
      expect(isFetchConflictError(new FetchConflictError('Conflict'))).toBe(true);
      expect(isFetchConflictError(new FetchNotFoundError('Not found'))).toBe(false);
    });

    it('should correctly identify FetchRateLimitError (429)', () => {
      expect(isFetchRateLimitError(new FetchRateLimitError('Too many requests'))).toBe(true);
      expect(isFetchRateLimitError(new FetchConflictError('Conflict'))).toBe(false);
    });

    it('should correctly identify FetchInternalServerError (500)', () => {
      expect(isFetchInternalServerError(new FetchInternalServerError('Server error'))).toBe(true);
      expect(isFetchInternalServerError(new FetchServiceUnavailableError('Unavailable'))).toBe(false);
    });

    it('should correctly identify FetchServiceUnavailableError (503)', () => {
      expect(isFetchServiceUnavailableError(new FetchServiceUnavailableError('Unavailable'))).toBe(
        true,
      );
      expect(isFetchServiceUnavailableError(new FetchInternalServerError('Server error'))).toBe(false);
    });
  });

  describe('createHttpError() factory', () => {
    it('should return FetchBadRequestError for status 400', () => {
      const error = createHttpError(400, 'Bad request');
      expect(error instanceof FetchBadRequestError).toBe(true);
      expect((error as FetchBadRequestError).status).toBe(400);
    });

    it('should return FetchUnauthorizedError for status 401', () => {
      const error = createHttpError(401, 'Unauthorized');
      expect(error instanceof FetchUnauthorizedError).toBe(true);
      expect((error as FetchUnauthorizedError).status).toBe(401);
    });

    it('should return FetchForbiddenError for status 403', () => {
      const error = createHttpError(403, 'Forbidden');
      expect(error instanceof FetchForbiddenError).toBe(true);
      expect((error as FetchForbiddenError).status).toBe(403);
    });

    it('should return FetchNotFoundError for status 404', () => {
      const error = createHttpError(404, 'Not found');
      expect(error instanceof FetchNotFoundError).toBe(true);
      expect((error as FetchNotFoundError).status).toBe(404);
    });

    it('should return FetchConflictError for status 409', () => {
      const error = createHttpError(409, 'Conflict');
      expect(error instanceof FetchConflictError).toBe(true);
      expect((error as FetchConflictError).status).toBe(409);
    });

    it('should return FetchGoneError for status 410', () => {
      const error = createHttpError(410, 'Gone');
      expect(error instanceof FetchGoneError).toBe(true);
      expect((error as FetchGoneError).status).toBe(410);
    });

    it('should return FetchUnprocessableEntityError for status 422', () => {
      const error = createHttpError(422, 'Unprocessable');
      expect(error instanceof FetchUnprocessableEntityError).toBe(true);
      expect((error as FetchUnprocessableEntityError).status).toBe(422);
    });

    it('should return FetchRateLimitError for status 429', () => {
      const error = createHttpError(429, 'Rate limited');
      expect(error instanceof FetchRateLimitError).toBe(true);
      expect((error as FetchRateLimitError).status).toBe(429);
    });

    it('should return FetchInternalServerError for status 500', () => {
      const error = createHttpError(500, 'Server error');
      expect(error instanceof FetchInternalServerError).toBe(true);
      expect((error as FetchInternalServerError).status).toBe(500);
    });

    it('should return FetchServiceUnavailableError for status 503', () => {
      const error = createHttpError(503, 'Service unavailable');
      expect(error instanceof FetchServiceUnavailableError).toBe(true);
      expect((error as FetchServiceUnavailableError).status).toBe(503);
    });

    it('should return generic HttpError for unmapped status codes', () => {
      const error = createHttpError(418, "I'm a teapot");
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof FetchBadRequestError).toBe(false);
      expect((error as HttpError).status).toBe(418);
    });

    it('should pass serverCode through for status 400', () => {
      const error = createHttpError(400, 'Bad request', 'MISSING_FIELD');
      expect((error as HttpError).serverCode).toBe('MISSING_FIELD');
    });

    it('should pass serverCode through for status 500', () => {
      const error = createHttpError(500, 'Server error', 'INTERNAL_ERROR');
      expect((error as HttpError).serverCode).toBe('INTERNAL_ERROR');
    });

    it('should pass serverCode through for status 503', () => {
      const error = createHttpError(503, 'Service unavailable', 'MAINTENANCE_MODE');
      expect((error as HttpError).serverCode).toBe('MAINTENANCE_MODE');
    });

    it('should pass serverCode through for unmapped status codes', () => {
      const error = createHttpError(418, "I'm a teapot", 'TEAPOT_ERROR');
      expect((error as HttpError).serverCode).toBe('TEAPOT_ERROR');
    });

    it('should preserve the message for any status code', () => {
      const error = createHttpError(404, 'Custom not found message');
      expect(error.message).toBe('Custom not found message');
    });
  });
});

/**
 * Union type for all FetchError types
 */
export type FetchError = FetchNetworkError | HttpError | FetchTimeoutError | ParseError | FetchValidationError;
