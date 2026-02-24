import { describe, expect, it } from 'bun:test';
import { err, isErr, isOk, ok, type Result } from '../result';

describe('Result', () => {
  describe('ok()', () => {
    it('creates an Ok result with the given value', () => {
      const result = ok({ id: 1, name: 'test' });
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
      if (isOk(result)) {
        expect(result.data).toEqual({ id: 1, name: 'test' });
      }
    });

    it('works with different data types', () => {
      expect(ok(42).data).toBe(42);
      expect(ok('hello').data).toBe('hello');
      expect(ok(null).data).toBe(null);
      expect(ok([1, 2, 3]).data).toEqual([1, 2, 3]);
    });
  });

  describe('err()', () => {
    it('creates an Err result with status code and body', () => {
      const result = err(404, { message: 'Not found' });
      expect(isErr(result)).toBe(true);
      expect(isOk(result)).toBe(false);
      if (isErr(result)) {
        expect(result.status).toBe(404);
        expect(result.body).toEqual({ message: 'Not found' });
      }
    });

    it('works with different status codes', () => {
      expect(err(400, { error: 'Bad request' }).status).toBe(400);
      expect(err(401, { error: 'Unauthorized' }).status).toBe(401);
      expect(err(403, { error: 'Forbidden' }).status).toBe(403);
      expect(err(500, { error: 'Internal error' }).status).toBe(500);
    });
  });

  describe('type guards', () => {
    it('isOk returns true for Ok results', () => {
      const okResult = ok({ data: 'value' });
      expect(isOk(okResult)).toBe(true);
    });

    it('isOk returns false for Err results', () => {
      const errResult = err(404, { message: 'Not found' });
      expect(isOk(errResult)).toBe(false);
    });

    it('isErr returns true for Err results', () => {
      const errResult = err(500, { error: 'Server error' });
      expect(isErr(errResult)).toBe(true);
    });

    it('isErr returns false for Ok results', () => {
      const okResult = ok({ data: 'value' });
      expect(isErr(okResult)).toBe(false);
    });
  });

  describe('Result type is generic', () => {
    it('works with specific data type', () => {
      type User = { id: number; name: string };
      const result: Result<User, { message: string }> = ok({ id: 1, name: 'John' });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.name).toBe('John');
      }
    });

    it('works with specific error type', () => {
      type AppError = { code: string; details?: unknown };
      const result: Result<{ id: number }, AppError> = err(409, { code: 'CONFLICT' });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.body.code).toBe('CONFLICT');
      }
    });
  });
});
