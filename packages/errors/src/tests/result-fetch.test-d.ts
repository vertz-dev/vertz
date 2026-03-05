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

import { describe, expect, it } from 'bun:test';
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
    const _check1: 'NetworkError' = {} as FetchNetworkError['code'];
    const _check2: FetchNetworkError['code'] = {} as 'NetworkError';
    void _check1; void _check2;
  });

  it('HttpError has code HttpError and status', () => {
    const _check1: 'HttpError' = {} as HttpError['code'];
    const _check2: HttpError['code'] = {} as 'HttpError';
    void _check1; void _check2;
    const _check3: number = {} as HttpError['status'];
    const _check4: HttpError['status'] = {} as number;
    void _check3; void _check4;
  });

  it('FetchTimeoutError has code TimeoutError', () => {
    const _check1: 'TimeoutError' = {} as FetchTimeoutError['code'];
    const _check2: FetchTimeoutError['code'] = {} as 'TimeoutError';
    void _check1; void _check2;
  });

  it('ParseError has code ParseError and path', () => {
    const _check1: 'ParseError' = {} as ParseError['code'];
    const _check2: ParseError['code'] = {} as 'ParseError';
    void _check1; void _check2;
    const _check3: string = {} as ParseError['path'];
    const _check4: ParseError['path'] = {} as string;
    void _check3; void _check4;
  });

  it('FetchValidationError has code ValidationError and errors', () => {
    const _check1: 'ValidationError' = {} as FetchValidationError['code'];
    const _check2: FetchValidationError['code'] = {} as 'ValidationError';
    void _check1; void _check2;
    const _check3: readonly { readonly path: string; readonly message: string }[] = {} as FetchValidationError['errors'];
    const _check4: FetchValidationError['errors'] = {} as readonly { readonly path: string; readonly message: string }[];
    void _check3; void _check4;
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
