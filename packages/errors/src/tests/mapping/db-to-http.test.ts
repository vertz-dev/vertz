import { describe, expect, it } from 'vitest';
import {
  createCheckViolation,
  createFKViolation,
  createNotFoundError,
  createNotNullViolation,
  createUniqueViolation,
} from '../../domain/db';
import {
  checkViolationToHttpStatus,
  dbErrorToHttpStatus,
  fkViolationToHttpStatus,
  notFoundErrorToHttpStatus,
  notNullViolationToHttpStatus,
  uniqueViolationToHttpStatus,
} from '../../mapping/db-to-http';

describe('mapping/db-to-http', () => {
  describe('dbErrorToHttpStatus()', () => {
    it('maps NOT_FOUND to 404', () => {
      const error = createNotFoundError('users');
      expect(dbErrorToHttpStatus(error)).toBe(404);
    });

    it('maps UNIQUE_VIOLATION to 409', () => {
      const error = createUniqueViolation('Duplicate');
      expect(dbErrorToHttpStatus(error)).toBe(409);
    });

    it('maps FK_VIOLATION to 422', () => {
      const error = createFKViolation('Reference not found');
      expect(dbErrorToHttpStatus(error)).toBe(422);
    });

    it('maps NOT_NULL_VIOLATION to 422', () => {
      const error = createNotNullViolation('Required');
      expect(dbErrorToHttpStatus(error)).toBe(422);
    });

    it('maps CHECK_VIOLATION to 422', () => {
      const error = createCheckViolation('Check failed');
      expect(dbErrorToHttpStatus(error)).toBe(422);
    });
  });

  describe('individual functions', () => {
    it('notFoundErrorToHttpStatus returns 404', () => {
      expect(notFoundErrorToHttpStatus(createNotFoundError('users'))).toBe(404);
    });

    it('uniqueViolationToHttpStatus returns 409', () => {
      expect(uniqueViolationToHttpStatus(createUniqueViolation('Duplicate'))).toBe(409);
    });

    it('fkViolationToHttpStatus returns 422', () => {
      expect(fkViolationToHttpStatus(createFKViolation('Reference'))).toBe(422);
    });

    it('notNullViolationToHttpStatus returns 422', () => {
      expect(notNullViolationToHttpStatus(createNotNullViolation('Required'))).toBe(422);
    });

    it('checkViolationToHttpStatus returns 422', () => {
      expect(checkViolationToHttpStatus(createCheckViolation('Check'))).toBe(422);
    });
  });
});
