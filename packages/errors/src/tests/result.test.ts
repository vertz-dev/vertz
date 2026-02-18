import { describe, expect, it } from 'vitest';
import { err, flatMap, isErr, isOk, map, match, matchErr, ok, unwrap, unwrapOr } from '../result';

describe('Result', () => {
  describe('ok()', () => {
    it('creates a successful result', () => {
      const result = ok({ name: 'Alice' });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ name: 'Alice' });
    });

    it('preserves type inference', () => {
      const result = ok(42);
      expect(result.data).toBe(42);
    });
  });

  describe('err()', () => {
    it('creates an error result', () => {
      const error = { code: 'NOT_FOUND', message: 'User not found' };
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toEqual(error);
    });

    it('works with simple string errors', () => {
      const result = err('Something went wrong');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });
  });

  describe('unwrap()', () => {
    it('returns data on success', () => {
      const result = ok({ name: 'Alice' });
      expect(unwrap(result)).toEqual({ name: 'Alice' });
    });

    it('throws error on failure', () => {
      const error = { code: 'NOT_FOUND', message: 'Not found' };
      const result = err(error);
      expect(() => unwrap(result)).toThrow();
    });
  });

  describe('unwrapOr()', () => {
    it('returns data on success', () => {
      const result = ok({ name: 'Alice' });
      expect(unwrapOr(result, { name: 'Default' })).toEqual({ name: 'Alice' });
    });

    it('returns default on failure', () => {
      const result = err({ code: 'NOT_FOUND', message: 'Not found' });
      expect(unwrapOr(result, { name: 'Default' })).toEqual({ name: 'Default' });
    });
  });

  describe('map()', () => {
    it('transforms the data on success', () => {
      const result = ok({ name: 'Alice' });
      const mapped = map(result, (data) => data.name.toUpperCase());
      expect(mapped.ok).toBe(true);
      expect(mapped.data).toBe('ALICE');
    });

    it('passes through error on failure', () => {
      const error = { code: 'NOT_FOUND', message: 'Not found' };
      const result = err(error);
      const mapped = map(result, (data: { name: string }) => data.name.toUpperCase());
      expect(mapped.ok).toBe(false);
      expect(mapped.error).toEqual(error);
    });
  });

  describe('flatMap()', () => {
    it('chains successful results (sync)', () => {
      const result = ok(5);
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(chained.ok).toBe(true);
      expect(chained.data).toBe(10);
    });

    it('propagates error (sync)', () => {
      const error = { code: 'NOT_FOUND', message: 'Not found' };
      const result = err<typeof error>(error);
      const chained = flatMap(result, (x: number) => ok(x * 2));
      expect(chained.ok).toBe(false);
      expect(chained.error).toEqual(error);
    });

    it('chains successful results (async)', async () => {
      const result = ok(5);
      const chained = await flatMap(result, async (x) => ok(x * 2));
      expect(chained.ok).toBe(true);
      expect(chained.data).toBe(10);
    });

    it('propagates error (async)', async () => {
      const error = { code: 'NOT_FOUND', message: 'Not found' };
      const result = err<typeof error>(error);
      const chained = await flatMap(result, async (x: number) => ok(x * 2));
      expect(chained.ok).toBe(false);
      expect(chained.error).toEqual(error);
    });
  });

  describe('match()', () => {
    it('calls ok handler on success', () => {
      const result = ok({ name: 'Alice' });
      const message = match(result, {
        ok: (data) => `Hello, ${data.name}!`,
        err: (e) => `Error: ${e.message}`,
      });
      expect(message).toBe('Hello, Alice!');
    });

    it('calls err handler on failure', () => {
      const result = err({ code: 'NOT_FOUND', message: 'Not found' });
      const message = match(result, {
        ok: (data) => `Hello, ${(data as { name: string }).name}!`,
        err: (e) => `Error: ${e.message}`,
      });
      expect(message).toBe('Error: Not found');
    });
  });

  describe('matchErr()', () => {
    it('calls ok handler on success', () => {
      const result = ok({ name: 'Alice' });
      const message = matchErr(result, {
        ok: (data) => `Hello, ${data.name}!`,
        NOT_FOUND: (e) => `Not found: ${e.table}`,
      });
      expect(message).toBe('Hello, Alice!');
    });

    it('calls error-specific handler on failure', () => {
      const result = err({ code: 'NOT_FOUND' as const, message: 'Not found', table: 'users' });
      const message = matchErr(result, {
        ok: (data) => `Hello, ${data.name}!`,
        NOT_FOUND: (e) => `Not found in ${e.table}`,
      });
      expect(message).toBe('Not found in users');
    });

    it('throws on unhandled error code', () => {
      const result = err({ code: 'UNKNOWN' as const, message: 'Unknown', table: 'users' });
      expect(() =>
        matchErr(result, {
          ok: (data) => data,
          NOT_FOUND: (e) => e.table,
        }),
      ).toThrow('Unhandled error code: UNKNOWN');
    });
  });

  describe('isOk()', () => {
    it('returns true for Ok results', () => {
      const result = ok({ name: 'Alice' });
      expect(isOk(result)).toBe(true);
    });

    it('returns false for Err results', () => {
      const result = err({ code: 'NOT_FOUND', message: 'Not found' });
      expect(isOk(result)).toBe(false);
    });
  });

  describe('isErr()', () => {
    it('returns true for Err results', () => {
      const result = err({ code: 'NOT_FOUND', message: 'Not found' });
      expect(isErr(result)).toBe(true);
    });

    it('returns false for Ok results', () => {
      const result = ok({ name: 'Alice' });
      expect(isErr(result)).toBe(false);
    });
  });
});
