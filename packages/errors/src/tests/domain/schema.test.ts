import { describe, expect, it } from 'vitest';
import {
  createValidationError,
  isValidationError,
  type SchemaError,
  type ValidationIssue,
} from '../../domain/schema';

describe('domain/schema', () => {
  describe('ValidationError', () => {
    it('creates a ValidationError with the correct code', () => {
      const issues: ValidationIssue[] = [
        { path: ['email'], message: 'Invalid email format', code: 'invalid_string' },
      ];
      const error = createValidationError('Validation failed', issues);
      expect(error.code).toBe('VALIDATION_FAILED');
    });

    it('preserves the message passed to the factory', () => {
      const error = createValidationError('Email is required', []);
      expect(error.message).toBe('Email is required');
    });

    it('preserves the issues array with all issue properties', () => {
      const issues: ValidationIssue[] = [
        { path: ['users', 0, 'email'], message: 'Invalid email', code: 'invalid_string' },
        { path: ['users', 0, 'age'], message: 'Expected number', code: 'invalid_type' },
      ];
      const error = createValidationError('Validation failed', issues);

      expect(error.issues).toHaveLength(2);
      expect(error.issues[0]).toEqual({
        path: ['users', 0, 'email'],
        message: 'Invalid email',
        code: 'invalid_string',
      });
      expect(error.issues[1]).toEqual({
        path: ['users', 0, 'age'],
        message: 'Expected number',
        code: 'invalid_type',
      });
    });

    it('works with an empty issues array', () => {
      const error = createValidationError('No issues', []);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.issues).toHaveLength(0);
    });

  });

  describe('isValidationError', () => {
    it('returns true for a ValidationError', () => {
      const error = createValidationError('Validation failed', []);
      expect(isValidationError(error)).toBe(true);
    });

    it('returns true for any object with matching code (discriminant-based guard)', () => {
      // isValidationError checks only the code discriminant — it does not verify
      // that message or issues are present. Consumers who need those fields must
      // access them after the guard narrows the type.
      expect(isValidationError({ code: 'VALIDATION_FAILED' })).toBe(true);
    });

    it('returns false for an error with a different code', () => {
      const otherError = { code: 'NotFound', message: 'Not found' };
      expect(isValidationError(otherError)).toBe(false);
    });

    it('returns false for an error with an empty code', () => {
      const otherError = { code: '' };
      expect(isValidationError(otherError)).toBe(false);
    });
  });

  describe('type unions', () => {
    it('SchemaError accepts ValidationError', () => {
      const error: SchemaError = createValidationError('Validation failed', []);
      expect(error.code).toBe('VALIDATION_FAILED');
    });
  });
});
