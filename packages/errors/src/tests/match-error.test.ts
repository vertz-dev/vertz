/**
 * Tests for matchError() utility.
 */

import { describe, it, expect } from 'bun:test';
import { matchError } from '../match-error.js';
import { FetchNetworkError, HttpError, FetchTimeoutError, ParseError, FetchValidationError } from '../fetch.js';
import {
  BadRequestError,
  EntityUnauthorizedError,
  EntityForbiddenError,
  EntityNotFoundError,
  MethodNotAllowedError,
  EntityConflictError,
  EntityValidationError,
  InternalError,
  ServiceUnavailableError,
} from '../entity.js';

// Test helper to simulate matchError usage
type FetchErrorType = 
  | FetchNetworkError 
  | HttpError 
  | FetchTimeoutError 
  | ParseError 
  | FetchValidationError;

type EntityErrorType = 
  | BadRequestError 
  | EntityUnauthorizedError 
  | EntityForbiddenError 
  | EntityNotFoundError 
  | MethodNotAllowedError 
  | EntityConflictError 
  | EntityValidationError 
  | InternalError 
  | ServiceUnavailableError;

describe('matchError', () => {
  describe('FetchError exhaustiveness', () => {
    it('should handle FetchNetworkError', () => {
      const error = new FetchNetworkError();
      const result = matchError(error, {
        NetworkError: () => 'network',
        HttpError: () => 'http',
        TimeoutError: () => 'timeout',
        ParseError: () => 'parse',
        ValidationError: () => 'validation',
      });
      expect(result).toBe('network');
    });

    it('should handle HttpError', () => {
      const error = new HttpError(404, 'Not Found');
      const result = matchError(error, {
        NetworkError: () => 'network',
        HttpError: () => 'http',
        TimeoutError: () => 'timeout',
        ParseError: () => 'parse',
        ValidationError: () => 'validation',
      });
      expect(result).toBe('http');
    });

    it('should handle FetchTimeoutError', () => {
      const error = new FetchTimeoutError();
      const result = matchError(error, {
        NetworkError: () => 'network',
        HttpError: () => 'http',
        TimeoutError: () => 'timeout',
        ParseError: () => 'parse',
        ValidationError: () => 'validation',
      });
      expect(result).toBe('timeout');
    });

    it('should handle ParseError', () => {
      const error = new ParseError('path', 'msg');
      const result = matchError(error, {
        NetworkError: () => 'network',
        HttpError: () => 'http',
        TimeoutError: () => 'timeout',
        ParseError: () => 'parse',
        ValidationError: () => 'validation',
      });
      expect(result).toBe('parse');
    });

    it('should handle FetchValidationError', () => {
      const error = new FetchValidationError([]);
      const result = matchError(error, {
        NetworkError: () => 'network',
        HttpError: () => 'http',
        TimeoutError: () => 'timeout',
        ParseError: () => 'parse',
        ValidationError: () => 'validation',
      });
      expect(result).toBe('validation');
    });
  });

  describe('EntityError exhaustiveness', () => {
    it('should handle BadRequestError', () => {
      const error = new BadRequestError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('bad-request');
    });

    it('should handle EntityUnauthorizedError', () => {
      const error = new EntityUnauthorizedError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('unauthorized');
    });

    it('should handle EntityForbiddenError', () => {
      const error = new EntityForbiddenError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('forbidden');
    });

    it('should handle EntityNotFoundError', () => {
      const error = new EntityNotFoundError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('not-found');
    });

    it('should handle MethodNotAllowedError', () => {
      const error = new MethodNotAllowedError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('method-not-allowed');
    });

    it('should handle EntityConflictError', () => {
      const error = new EntityConflictError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('conflict');
    });

    it('should handle EntityValidationError', () => {
      const error = new EntityValidationError([]);
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('validation');
    });

    it('should handle InternalError', () => {
      const error = new InternalError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('internal');
    });

    it('should handle ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError();
      const result = matchError(error, {
        BadRequest: () => 'bad-request',
        Unauthorized: () => 'unauthorized',
        Forbidden: () => 'forbidden',
        NotFound: () => 'not-found',
        MethodNotAllowed: () => 'method-not-allowed',
        Conflict: () => 'conflict',
        ValidationError: () => 'validation',
        InternalError: () => 'internal',
        ServiceUnavailable: () => 'unavailable',
      });
      expect(result).toBe('unavailable');
    });
  });

  describe('TypeScript exhaustiveness checking', () => {
    // This test should compile only if all error types are handled
    // If you add a new error type but don't handle it, TypeScript should error
    it('should require handling all error types', () => {
      // This function ensures all FetchError types are handled
      function assertExhaustiveFetch(error: FetchErrorType): string {
        return matchError(error, {
          NetworkError: () => 'network',
          HttpError: () => 'http',
          TimeoutError: () => 'timeout',
          ParseError: () => 'parse',
          ValidationError: () => 'validation',
        });
      }

      // This function ensures all EntityError types are handled
      function assertExhaustiveEntity(error: EntityErrorType): string {
        return matchError(error, {
          BadRequest: () => 'bad-request',
          Unauthorized: () => 'unauthorized',
          Forbidden: () => 'forbidden',
          NotFound: () => 'not-found',
          MethodNotAllowed: () => 'method-not-allowed',
          Conflict: () => 'conflict',
          ValidationError: () => 'validation',
          InternalError: () => 'internal',
          ServiceUnavailable: () => 'unavailable',
        });
      }

      // Just verify the functions exist and can be called
      expect(assertExhaustiveFetch).toBeDefined();
      expect(assertExhaustiveEntity).toBeDefined();
    });
  });
});
