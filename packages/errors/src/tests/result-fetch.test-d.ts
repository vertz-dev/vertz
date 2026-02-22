/**
 * Type-level tests for Result + Fetch error integration.
 *
 * These tests verify that matchError works correctly with PascalCase keys
 * and that error type narrowing works as expected.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { ok, err, matchErr, type Result } from '../result';
import {
  FetchNetworkError,
  HttpError,
  FetchTimeoutError,
  ParseError,
  FetchValidationError,
  FetchGoneError,
  FetchUnprocessableEntityError,
  type FetchErrorType,
} from '../fetch';

describe('matchError with PascalCase keys', () => {
  it('should type-check with NetworkError key', () => {
    const error = new FetchNetworkError();
    const result = matchErr(ok({}), {
      ok: (data) => data,
      NetworkError: (e) => e.message,
    });
    expectTypeOf(result).toEqualTypeOf<{ name: string } | string>();
  });

  it('should type-check with HttpError key', () => {
    const error = new HttpError(404, 'Not Found');
    const result = matchErr(ok({}), {
      ok: (data) => data,
      HttpError: (e) => e.status,
    });
    expectTypeOf(result).toEqualTypeOf<{ name: string } | number>();
  });

  it('should type-check with TimeoutError key', () => {
    const error = new FetchTimeoutError();
    const result = matchErr(ok({}), {
      ok: (data) => data,
      TimeoutError: (e) => e.message,
    });
    expectTypeOf(result).toEqualTypeOf<{ name: string } | string>();
  });

  it('should type-check with ParseError key', () => {
    const error = new ParseError('path', 'msg');
    const result = matchErr(ok({}), {
      ok: (data) => data,
      ParseError: (e) => e.path,
    });
    expectTypeOf(result).toEqualTypeOf<{ name: string } | string>();
  });

  it('should type-check with ValidationError key', () => {
    const error = new FetchValidationError('failed', []);
    const result = matchErr(ok({}), {
      ok: (data) => data,
      ValidationError: (e) => e.errors,
    });
    expectTypeOf(result).toEqualTypeOf<{ name: string } | readonly { path: string; message: string }[]>();
  });
});

describe('FetchError instanceof narrowing', () => {
  it('should narrow FetchGoneError (410)', () => {
    const error = new FetchGoneError('Gone');
    expect(error instanceof HttpError).toBe(true);
    expect(error.status).toBe(410);
  });

  it('should narrow FetchUnprocessableEntityError (422)', () => {
    const error = new FetchUnprocessableEntityError('Invalid');
    expect(error instanceof HttpError).toBe(true);
    expect(error.status).toBe(422);
  });
});

describe('FetchErrorType union', () => {
  it('should include all fetch error types', () => {
    // This test ensures the FetchErrorType union is correctly defined
    const errors: FetchErrorType[] = [
      new FetchNetworkError(),
      new HttpError(400, 'Bad Request'),
      new FetchTimeoutError(),
      new ParseError('path', 'msg'),
      new FetchValidationError('failed', []),
      new FetchGoneError('Gone'),
      new FetchUnprocessableEntityError('Invalid'),
    ];
    expect(errors.length).toBe(7);
  });
});
