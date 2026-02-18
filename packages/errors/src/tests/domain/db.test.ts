import { describe, expect, it } from 'vitest';
import {
  createCheckViolation,
  createFKViolation,
  createNotFoundError,
  createNotNullViolation,
  createUniqueViolation,
  isCheckViolation,
  isFKViolation,
  isNotFoundError,
  isNotNullViolation,
  isUniqueViolation,
  type ReadError,
  type WriteError,
} from '../../domain/db';

describe('domain/db', () => {
  describe('NotFoundError', () => {
    it('creates a NotFoundError', () => {
      const error = createNotFoundError('users', { id: 1 });
      expect(error.code).toBe('NOT_FOUND');
      expect(error.table).toBe('users');
      expect(error.key).toEqual({ id: 1 });
      expect(error.message).toContain('users');
    });

    it('works without key', () => {
      const error = createNotFoundError('users');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.table).toBe('users');
      expect(error.key).toBeUndefined();
    });

    it('isNotFoundError returns true for NotFoundError', () => {
      const error = createNotFoundError('users');
      expect(isNotFoundError(error)).toBe(true);
    });

    it('isNotFoundError returns false for other errors', () => {
      const error = createUniqueViolation('Duplicate');
      expect(isNotFoundError(error)).toBe(false);
    });
  });

  describe('UniqueViolation', () => {
    it('creates a UniqueViolation with all options', () => {
      const error = createUniqueViolation('Email already exists', {
        constraint: 'users_email_unique',
        table: 'users',
        column: 'email',
      });
      expect(error.code).toBe('UNIQUE_VIOLATION');
      expect(error.constraint).toBe('users_email_unique');
      expect(error.table).toBe('users');
      expect(error.column).toBe('email');
    });

    it('works with minimal options', () => {
      const error = createUniqueViolation('Duplicate');
      expect(error.code).toBe('UNIQUE_VIOLATION');
    });

    it('isUniqueViolation returns true for UniqueViolation', () => {
      const error = createUniqueViolation('Duplicate');
      expect(isUniqueViolation(error)).toBe(true);
    });
  });

  describe('FKViolation', () => {
    it('creates a FKViolation', () => {
      const error = createFKViolation('Referenced user not found', {
        constraint: 'orders_user_id_fkey',
        table: 'orders',
        column: 'user_id',
        referencedTable: 'users',
      });
      expect(error.code).toBe('FK_VIOLATION');
      expect(error.constraint).toBe('orders_user_id_fkey');
      expect(error.referencedTable).toBe('users');
    });

    it('isFKViolation returns true for FKViolation', () => {
      const error = createFKViolation('Reference not found');
      expect(isFKViolation(error)).toBe(true);
    });
  });

  describe('NotNullViolation', () => {
    it('creates a NotNullViolation', () => {
      const error = createNotNullViolation('Email is required', {
        table: 'users',
        column: 'email',
      });
      expect(error.code).toBe('NOT_NULL_VIOLATION');
      expect(error.column).toBe('email');
    });

    it('isNotNullViolation returns true for NotNullViolation', () => {
      const error = createNotNullViolation('Required field missing');
      expect(isNotNullViolation(error)).toBe(true);
    });
  });

  describe('CheckViolation', () => {
    it('creates a CheckViolation', () => {
      const error = createCheckViolation('Age must be positive', {
        constraint: 'users_age_check',
        table: 'users',
      });
      expect(error.code).toBe('CHECK_VIOLATION');
      expect(error.constraint).toBe('users_age_check');
    });

    it('isCheckViolation returns true for CheckViolation', () => {
      const error = createCheckViolation('Check constraint failed');
      expect(isCheckViolation(error)).toBe(true);
    });
  });

  describe('type unions', () => {
    it('ReadError accepts NotFoundError', () => {
      const error: ReadError = createNotFoundError('users');
      expect(error.code).toBe('NOT_FOUND');
    });

    it('WriteError accepts all write error types', () => {
      const unique: WriteError = createUniqueViolation('Duplicate');
      const fk: WriteError = createFKViolation('Reference not found');
      const notNull: WriteError = createNotNullViolation('Required');
      const check: WriteError = createCheckViolation('Check failed');

      expect(unique.code).toBe('UNIQUE_VIOLATION');
      expect(fk.code).toBe('FK_VIOLATION');
      expect(notNull.code).toBe('NOT_NULL_VIOLATION');
      expect(check.code).toBe('CHECK_VIOLATION');
    });
  });
});
