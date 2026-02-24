/**
 * Tests for EntityError classes.
 */

import { describe, it, expect } from 'bun:test';
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
  isBadRequestError,
  isEntityUnauthorizedError,
  isEntityForbiddenError,
  isEntityNotFoundError,
  isMethodNotAllowedError,
  isEntityConflictError,
  isEntityValidationError,
  isInternalError,
  isServiceUnavailableError,
} from '../entity.js';

describe('EntityError classes', () => {
  describe('BadRequestError', () => {
    it('should create a BadRequestError with default message', () => {
      const error = new BadRequestError();
      expect(error.name).toBe('BadRequestError');
      expect(error.message).toBe('Bad Request');
      expect(error.code).toBe('BadRequest');
    });

    it('should create a BadRequestError with custom message', () => {
      const error = new BadRequestError('Invalid input');
      expect(error.message).toBe('Invalid input');
    });
  });

  describe('EntityUnauthorizedError', () => {
    it('should create an EntityUnauthorizedError with default message', () => {
      const error = new EntityUnauthorizedError();
      expect(error.name).toBe('UnauthorizedError');
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('Unauthorized');
    });

    it('should create an EntityUnauthorizedError with custom message', () => {
      const error = new EntityUnauthorizedError('Session expired');
      expect(error.message).toBe('Session expired');
    });
  });

  describe('EntityForbiddenError', () => {
    it('should create an EntityForbiddenError with default message', () => {
      const error = new EntityForbiddenError();
      expect(error.name).toBe('ForbiddenError');
      expect(error.message).toBe('Forbidden');
      expect(error.code).toBe('Forbidden');
    });

    it('should create an EntityForbiddenError with custom message', () => {
      const error = new EntityForbiddenError('Access denied');
      expect(error.message).toBe('Access denied');
    });
  });

  describe('EntityNotFoundError', () => {
    it('should create an EntityNotFoundError with default message', () => {
      const error = new EntityNotFoundError();
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('Not Found');
      expect(error.code).toBe('NotFound');
    });

    it('should create an EntityNotFoundError with resource info', () => {
      const error = new EntityNotFoundError('User not found', 'User', '123');
      expect(error.message).toBe('User not found');
      expect(error.resource).toBe('User');
      expect(error.resourceId).toBe('123');
    });
  });

  describe('MethodNotAllowedError', () => {
    it('should create a MethodNotAllowedError with default message', () => {
      const error = new MethodNotAllowedError();
      expect(error.name).toBe('MethodNotAllowedError');
      expect(error.message).toBe('Method Not Allowed');
      expect(error.code).toBe('MethodNotAllowed');
    });

    it('should create a MethodNotAllowedError with allowed methods', () => {
      const error = new MethodNotAllowedError('GET, HEAD', 'POST not allowed');
      expect(error.allowedMethods).toBe('GET, HEAD');
    });
  });

  describe('EntityConflictError', () => {
    it('should create an EntityConflictError with default message', () => {
      const error = new EntityConflictError();
      expect(error.name).toBe('ConflictError');
      expect(error.message).toBe('Conflict');
      expect(error.code).toBe('Conflict');
    });

    it('should create an EntityConflictError with resource info', () => {
      const error = new EntityConflictError('Email already exists', 'email');
      expect(error.message).toBe('Email already exists');
      expect(error.field).toBe('email');
    });
  });

  describe('EntityValidationError', () => {
    it('should create an EntityValidationError with errors', () => {
      const errors = [
        { path: ['name'], message: 'Required', code: 'REQUIRED' },
        { path: ['email'], message: 'Invalid format', code: 'INVALID_FORMAT' },
      ];
      const error = new EntityValidationError(errors);
      expect(error.name).toBe('EntityValidationError');
      expect(error.errors).toEqual(errors);
      expect(error.code).toBe('ValidationError');
    });
  });

  describe('InternalError', () => {
    it('should create an InternalError with default message', () => {
      const error = new InternalError();
      expect(error.name).toBe('InternalError');
      expect(error.message).toBe('Internal Server Error');
      expect(error.code).toBe('InternalError');
    });

    it('should create an InternalError with custom message', () => {
      const error = new InternalError('Database error');
      expect(error.message).toBe('Database error');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create a ServiceUnavailableError with default message', () => {
      const error = new ServiceUnavailableError();
      expect(error.name).toBe('ServiceUnavailableError');
      expect(error.message).toBe('Service Unavailable');
      expect(error.code).toBe('ServiceUnavailable');
    });

    it('should create a ServiceUnavailableError with retryAfter', () => {
      const error = new ServiceUnavailableError('Server overloaded', 60);
      expect(error.message).toBe('Server overloaded');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('Type guards', () => {
    it('should correctly identify BadRequestError', () => {
      const error = new BadRequestError();
      expect(isBadRequestError(error)).toBe(true);
      expect(isBadRequestError(new EntityUnauthorizedError())).toBe(false);
    });

    it('should correctly identify EntityUnauthorizedError', () => {
      const error = new EntityUnauthorizedError();
      expect(isEntityUnauthorizedError(error)).toBe(true);
      expect(isEntityUnauthorizedError(new EntityForbiddenError())).toBe(false);
    });

    it('should correctly identify EntityForbiddenError', () => {
      const error = new EntityForbiddenError();
      expect(isEntityForbiddenError(error)).toBe(true);
      expect(isEntityForbiddenError(new EntityNotFoundError())).toBe(false);
    });

    it('should correctly identify EntityNotFoundError', () => {
      const error = new EntityNotFoundError();
      expect(isEntityNotFoundError(error)).toBe(true);
      expect(isEntityNotFoundError(new EntityConflictError())).toBe(false);
    });

    it('should correctly identify MethodNotAllowedError', () => {
      const error = new MethodNotAllowedError();
      expect(isMethodNotAllowedError(error)).toBe(true);
      expect(isMethodNotAllowedError(new BadRequestError())).toBe(false);
    });

    it('should correctly identify EntityConflictError', () => {
      const error = new EntityConflictError();
      expect(isEntityConflictError(error)).toBe(true);
      expect(isEntityConflictError(new InternalError())).toBe(false);
    });

    it('should correctly identify EntityValidationError', () => {
      const error = new EntityValidationError([]);
      expect(isEntityValidationError(error)).toBe(true);
      expect(isEntityValidationError(new BadRequestError())).toBe(false);
    });

    it('should correctly identify InternalError', () => {
      const error = new InternalError();
      expect(isInternalError(error)).toBe(true);
      expect(isInternalError(new ServiceUnavailableError())).toBe(false);
    });

    it('should correctly identify ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError();
      expect(isServiceUnavailableError(error)).toBe(true);
      expect(isServiceUnavailableError(new InternalError())).toBe(false);
    });
  });
});

/**
 * Union type for all EntityError types
 */
export type EntityError =
  | BadRequestError
  | EntityUnauthorizedError
  | EntityForbiddenError
  | EntityNotFoundError
  | MethodNotAllowedError
  | EntityConflictError
  | EntityValidationError
  | InternalError
  | ServiceUnavailableError;
