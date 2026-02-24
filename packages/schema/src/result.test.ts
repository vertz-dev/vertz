import { describe, expect, it } from 'bun:test';
import {
  type Err,
  err,
  flatMap,
  map,
  match,
  matchErr,
  type Ok,
  ok,
  type Result,
  unwrap,
} from './result';

describe('Result', () => {
  describe('ok()', () => {
    it('creates a successful result with data', () => {
      const result = ok({ name: 'Alice' });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ name: 'Alice' });
    });

    it('preserves types', () => {
      const result: Ok<string> = ok('hello');
      expect(result.data).toBe('hello');
    });
  });

  describe('err()', () => {
    it('creates an error result with error', () => {
      const error = new Error('Failed');
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });

    it('preserves types', () => {
      const result: Err<string> = err('error message');
      expect(result.error).toBe('error message');
    });
  });

  describe('Result type', () => {
    it('is a discriminated union', () => {
      const success: Result<string, Error> = ok('value');
      const failure: Result<string, Error> = err(new Error('oops'));

      // TypeScript should correctly narrow
      if (success.ok) {
        expect(success.data).toBe('value');
      }
      if (!failure.ok) {
        expect(failure.error).toBeInstanceOf(Error);
      }
    });
  });

  describe('unwrap()', () => {
    it('returns data when ok', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('throws error when err', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(() => unwrap(result)).toThrow(error);
    });

    it('works with different value types', () => {
      expect(unwrap(ok('string'))).toBe('string');
      expect(unwrap(ok({ nested: { value: true } }))).toEqual({ nested: { value: true } });
      expect(unwrap(ok(null))).toBe(null);
      expect(unwrap(ok(undefined))).toBe(undefined);
    });
  });

  describe('map()', () => {
    it('transforms value when ok', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);
      expect(unwrap(mapped)).toBe(10);
    });

    it('passes through error when err', () => {
      const error = new Error('fail');
      const result: Result<number, Error> = err(error);
      const mapped = map(result, (x) => x * 2);
      expect(mapped.ok).toBe(false);
      expect(mapped.error).toBe(error);
    });

    it('allows changing the value type', () => {
      const result = ok({ name: 'Alice' });
      const mapped = map(result, (user) => user.name.toUpperCase());
      expect(unwrap(mapped)).toBe('ALICE');
    });

    it('allows changing the error type', () => {
      const stringError: Result<number, string> = err('error');
      const mapped = map(stringError, (x) => x.toString());
      expect(mapped.ok).toBe(false);
      expect((mapped as any).error).toBe('error');
    });
  });

  describe('flatMap()', () => {
    it('chains synchronous functions', () => {
      const result = ok(5);
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(unwrap(chained)).toBe(10);
    });

    it('short-circuits on error (sync)', () => {
      const error = new Error('fail');
      const result: Result<number, Error> = err(error);
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(chained.ok).toBe(false);
      expect(chained.error).toBe(error);
    });

    it('passes error through if inner result is error (sync)', () => {
      const result = ok(5);
      const innerError = new Error('inner fail');
      const chained = flatMap(result, (_) => err(innerError) as Result<number, Error>);
      expect(chained.ok).toBe(false);
      expect(chained.error).toBe(innerError);
    });

    it('chains async functions', async () => {
      const result = ok(5);
      const chained = await flatMap(result, async (x) => ok(x * 2));
      expect(unwrap(chained)).toBe(10);
    });

    it('short-circuits on error (async)', async () => {
      const error = new Error('fail');
      const result: Result<number, Error> = err(error);
      const chained = await flatMap(result, async (x) => ok(x * 2));
      expect(chained.ok).toBe(false);
      expect(chained.error).toBe(error);
    });

    it('passes error through if inner result is error (async)', async () => {
      const result = ok(5);
      const innerError = new Error('inner fail');
      const chained = await flatMap(result, async (_) => err(innerError) as Result<number, Error>);
      expect(chained.ok).toBe(false);
      expect(chained.error).toBe(innerError);
    });

    it('combines error types', async () => {
      const result = ok(5);
      // Inner function returns different error type
      const chained = await flatMap(result, (_x) => {
        const innerErr: Result<number, string> = err('string error');
        return innerErr;
      });
      expect(chained.ok).toBe(false);
      expect((chained as any).error).toBe('string error');
    });
  });

  describe('match()', () => {
    it('calls ok handler when success', () => {
      const result = ok('hello');
      const message = match(result, {
        ok: (data) => `Success: ${data}`,
        err: (error) => `Error: ${error}`,
      });
      expect(message).toBe('Success: hello');
    });

    it('calls err handler when failure', () => {
      const result = err(new Error('fail'));
      const message = match(result, {
        ok: (data) => `Success: ${data}`,
        err: (error) => `Error: ${error.message}`,
      });
      expect(message).toBe('Error: fail');
    });

    it('can return different types', () => {
      const success = ok(42);
      const failure = err('error');

      const num = match(success, {
        ok: (d) => d * 2,
        err: () => -1,
      });
      expect(num).toBe(84);

      const str = match(failure, {
        ok: (d) => d.toString(),
        err: () => 'failed',
      });
      expect(str).toBe('failed');
    });
  });

  describe('matchErr()', () => {
    // Define test error classes with code
    class ValidationError {
      readonly code = 'VALIDATION_ERROR' as const;
      constructor(public fields: Record<string, string[]>) {}
    }

    class NotFoundError {
      readonly code = 'NOT_FOUND' as const;
      constructor(
        public resource: string,
        public id: string,
      ) {}
    }

    class ConnectionError {
      readonly code = 'CONNECTION_ERROR' as const;
      constructor(public message: string) {}
    }

    type TestError = ValidationError | NotFoundError | ConnectionError;

    it('calls ok handler when success', () => {
      const result: Result<{ id: string }, TestError> = ok({ id: '123' });
      const response = matchErr(result, {
        ok: (data) => ({ status: 201 as const, body: data }),
        VALIDATION_ERROR: (e) => ({
          status: 400 as const,
          body: { error: 'invalid', fields: e.fields },
        }),
        NOT_FOUND: (e) => ({
          status: 404 as const,
          body: { error: 'not_found', resource: e.resource },
        }),
        CONNECTION_ERROR: (_e) => ({ status: 500 as const, body: { error: 'server_error' } }),
      });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: '123' });
    });

    it('calls correct error handler based on code', () => {
      const error = new NotFoundError('user', '123');
      const result: Result<{ id: string }, TestError> = err(error);

      const response = matchErr(result, {
        ok: (data) => ({ status: 201 as const, body: data }),
        VALIDATION_ERROR: (_e) => ({ status: 400 as const, body: { error: 'invalid' } }),
        NOT_FOUND: (e) => ({
          status: 404 as const,
          body: { error: 'not_found', resource: e.resource },
        }),
        CONNECTION_ERROR: (_e) => ({ status: 500 as const, body: { error: 'server_error' } }),
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'not_found', resource: 'user' });
    });

    it('throws if error code has no handler', () => {
      const error = new ValidationError({ email: ['invalid'] });
      const result: Result<{ id: string }, TestError> = err(error);

      // Only provide NOT_FOUND handler - should throw for VALIDATION_ERROR
      expect(() =>
        matchErr(result, {
          ok: (data) => data,
          NOT_FOUND: (_e) => ({ status: 404, body: { error: 'not_found' } }),
          // Missing VALIDATION_ERROR and CONNECTION_ERROR handlers
        }),
      ).toThrow('Unhandled error code: VALIDATION_ERROR');
    });

    it('handles all error codes exhaustively', () => {
      const validationError = new ValidationError({ email: ['invalid'] });
      const notFoundError = new NotFoundError('user', '123');
      const connectionError = new ConnectionError('timeout');

      const validateResult = matchErr<{ id: string }, TestError, string>(err(validationError), {
        ok: (d) => `ok: ${d.id}`,
        VALIDATION_ERROR: (e) => `validation: ${JSON.stringify(e.fields)}`,
        NOT_FOUND: (e) => `not_found: ${e.resource}`,
        CONNECTION_ERROR: (e) => `connection: ${e.message}`,
      });
      expect(validateResult).toBe('validation: {"email":["invalid"]}');

      const notFoundResult = matchErr<{ id: string }, TestError, string>(err(notFoundError), {
        ok: (d) => `ok: ${d.id}`,
        VALIDATION_ERROR: (e) => `validation: ${JSON.stringify(e.fields)}`,
        NOT_FOUND: (e) => `not_found: ${e.resource}`,
        CONNECTION_ERROR: (e) => `connection: ${e.message}`,
      });
      expect(notFoundResult).toBe('not_found: user');

      const connectionResult = matchErr<{ id: string }, TestError, string>(err(connectionError), {
        ok: (d) => `ok: ${d.id}`,
        VALIDATION_ERROR: (e) => `validation: ${JSON.stringify(e.fields)}`,
        NOT_FOUND: (e) => `not_found: ${e.resource}`,
        CONNECTION_ERROR: (e) => `connection: ${e.message}`,
      });
      expect(connectionResult).toBe('connection: timeout');
    });

    it('works with string code errors', () => {
      // Errors can have string literal codes
      type SimpleError = { readonly code: 'FOO' } | { readonly code: 'BAR' };
      const fooError: SimpleError = { code: 'FOO' as const };
      const barError: SimpleError = { code: 'BAR' as const };

      const fooResult = matchErr<number, SimpleError, string>(err(fooError), {
        ok: (d) => d.toString(),
        FOO: () => 'foo error',
        BAR: () => 'bar error',
      });
      expect(fooResult).toBe('foo error');

      const barResult = matchErr<number, SimpleError, string>(err(barError), {
        ok: (d) => d.toString(),
        FOO: () => 'foo error',
        BAR: () => 'bar error',
      });
      expect(barResult).toBe('bar error');
    });
  });

  describe('integration examples from design doc', () => {
    it('map — transform without short-circuiting', () => {
      const userResult = ok({ name: 'Alice', avatarUrl: 'https://example.com/alice.png' });

      const userDto = map(userResult, (u) => ({
        id: '1',
        name: u.name,
        avatar: u.avatarUrl,
      }));

      expect(unwrap(userDto)).toEqual({
        id: '1',
        name: 'Alice',
        avatar: 'https://example.com/alice.png',
      });
    });

    it('flatMap — chaining that preserves errors', () => {
      const innerResult = flatMap(ok(5), (x) => ok(x * 3));
      expect(unwrap(innerResult)).toBe(15);

      // Error propagation
      const errorResult = flatMap(ok(5), (_) => err('failed') as Result<number, string>);
      expect(errorResult.ok).toBe(false);
      expect((errorResult as any).error).toBe('failed');
    });

    it('match — explicit branches', () => {
      const successResult = ok({ data: 'hello' });
      const html = match(successResult, {
        ok: (data) => `<div>${data.data}</div>`,
        err: (error) => `<div class="error">${String(error)}</div>`,
      });
      expect(html).toBe('<div>hello</div>');

      const errorResult: Result<{ data: string }, string> = err('Something went wrong');
      const errorHtml = match(errorResult, {
        ok: (data) => `<div>${data.data}</div>`,
        err: (error) => `<div class="error">${error}</div>`,
      });
      expect(errorHtml).toBe('<div class="error">Something went wrong</div>');
    });
  });
});
