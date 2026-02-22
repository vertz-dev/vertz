/**
 * Tests for FetchError classes.
 */

import { describe, it, expect } from 'vitest';
import {
  FetchNetworkError,
  HttpError,
  FetchTimeoutError,
  ParseError,
  FetchValidationError,
  FetchGoneError,
  FetchUnprocessableEntityError,
  isFetchNetworkError,
  isHttpError,
  isFetchTimeoutError,
  isParseError,
  isFetchValidationError,
  isFetchGoneError,
  isFetchUnprocessableEntityError,
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
      expect(isFetchGoneError(new HttpError(404, 'Not Found'))).toBe(false);
    });

    it('should correctly identify FetchUnprocessableEntityError (422)', () => {
      const error = new FetchUnprocessableEntityError('Invalid data');
      expect(error.status).toBe(422);
      expect(error.name).toBe('FetchUnprocessableEntityError');
      expect(isFetchUnprocessableEntityError(error)).toBe(true);
      expect(isFetchUnprocessableEntityError(new HttpError(400, 'Bad Request'))).toBe(false);
    });
  });
});

/**
 * Union type for all FetchError types
 */
export type FetchError = FetchNetworkError | HttpError | FetchTimeoutError | ParseError | FetchValidationError;
