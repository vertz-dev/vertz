/**
 * Type-level tests for Result + Fetch error integration.
 *
 * Validates that FetchError classes have the correct shapes and that
 * error narrowing works as expected.
 *
 * Note: matchErr's generic ErrorHandlers<E, R> doesn't support contextual
 * typing of callback params due to a TypeScript limitation with complex
 * mapped types and intersections. Handler params must be explicitly annotated.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type FetchErrorType,
  FetchGoneError,
  FetchNetworkError,
  FetchTimeoutError,
  FetchUnprocessableEntityError,
  FetchValidationError,
  HttpError,
  ParseError,
} from '../fetch';

describe('FetchError class shapes', () => {
  it('FetchNetworkError has code NetworkError', () => {
    expectTypeOf<FetchNetworkError['code']>().toEqualTypeOf<'NetworkError'>();
  });

  it('HttpError has code HttpError and status', () => {
    expectTypeOf<HttpError['code']>().toEqualTypeOf<'HttpError'>();
    expectTypeOf<HttpError['status']>().toEqualTypeOf<number>();
  });

  it('FetchTimeoutError has code TimeoutError', () => {
    expectTypeOf<FetchTimeoutError['code']>().toEqualTypeOf<'TimeoutError'>();
  });

  it('ParseError has code ParseError and path', () => {
    expectTypeOf<ParseError['code']>().toEqualTypeOf<'ParseError'>();
    expectTypeOf<ParseError['path']>().toEqualTypeOf<string>();
  });

  it('FetchValidationError has code ValidationError and errors', () => {
    expectTypeOf<FetchValidationError['code']>().toEqualTypeOf<'ValidationError'>();
    expectTypeOf<FetchValidationError['errors']>().toEqualTypeOf<
      readonly { readonly path: string; readonly message: string }[]
    >();
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
