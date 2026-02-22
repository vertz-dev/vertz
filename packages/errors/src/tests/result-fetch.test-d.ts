/**
 * Type-level tests for Result pattern and FetchError types.
 *
 * These tests verify that TypeScript correctly enforces:
 * 1. Result type narrowing after checking result.ok
 * 2. FetchError union exhaustiveness in matchError
 * 3. Error class hierarchy and instanceof narrowing
 * 4. Generated SDK types export Result and FetchError correctly
 */

import type { Result } from '../result';
import {
  FetchError,
  type FetchErrorType,
  FetchNetworkError,
  HttpError,
  FetchNotFoundError,
  FetchBadRequestError,
  FetchUnauthorizedError,
  FetchForbiddenError,
  FetchConflictError,
  FetchGoneError,
  FetchUnprocessableEntityError,
  FetchRateLimitError,
  FetchInternalServerError,
  FetchServiceUnavailableError,
  FetchTimeoutError,
  ParseError,
  FetchValidationError,
  isFetchNetworkError,
  isHttpError,
  isFetchBadRequestError,
  isFetchNotFoundError,
  isFetchTimeoutError,
  isParseError,
  isFetchValidationError,
} from '../fetch';
import { matchError } from '../match-error';
import { ok, err } from '../result';

// ============================================================================
// Test 1: Result type narrowing
// ============================================================================

// After `if (result.ok)`, `result.data` is accessible
void (function testOkBranchNarrowing() {
  const result: Result<string, FetchError> = ok('hello');

  if (result.ok) {
    // result.data should be accessible in ok branch
    const data: string = result.data;

    // @ts-expect-error - result.error should NOT be accessible in ok branch
    const _error: FetchError = result.error;

    return { data };
  }
});

// After `if (!result.ok)`, `result.error` is FetchError
void (function testErrBranchNarrowing() {
  const result: Result<string, FetchError> = err(new FetchNotFoundError('Not found'));

  if (!result.ok) {
    // result.error should be FetchError in err branch
    const error: FetchError = result.error;

    // @ts-expect-error - result.data should NOT be accessible in err branch
    const _data: string = result.data;

    return { error };
  }
});

// After explicit ok check, data is accessible with correct type
void (function testDataAccessibleAfterOkCheck() {
  const result: Result<string, FetchError> = ok('hello');

  // After explicit ok check, data is accessible
  if (result.ok) {
    const data: string = result.data;
    return { data };
  }
});

// ============================================================================
// Test 2: FetchError union exhaustiveness
// ============================================================================

// matchError with all variants compiles
void (function testMatchErrorAllVariants() {
  const error: FetchErrorType = new FetchNotFoundError('Not found');

  const result = matchError(error, {
    NETWORK_ERROR: (e) => e.code,
    HTTP_ERROR: (e) => e.code,
    TIMEOUT_ERROR: (e) => e.code,
    PARSE_ERROR: (e) => e.code,
    VALIDATION_ERROR: (e) => e.code,
  });

  const _result: string = result;
});

// matchError missing a variant causes type error
void (function testMatchErrorMissingVariant() {
  const error: FetchErrorType = new FetchNotFoundError('Not found');

  // @ts-expect-error - Missing TIMEOUT_ERROR handler should cause type error
  const result = matchError(error, {
    NETWORK_ERROR: (e) => e.code,
    HTTP_ERROR: (e) => e.code,
    PARSE_ERROR: (e) => e.code,
    VALIDATION_ERROR: (e) => e.code,
  });
});

// instanceof narrows correctly - specific errors are instances of HttpError
void (function testInstanceofNarrowing() {
  const error: HttpError = new FetchNotFoundError('Not found');

  if (error instanceof FetchNotFoundError) {
    // After instanceof check, status is still number (inherited from HttpError)
    const status: number = error.status;
    return { status };
  }
});

// ============================================================================
// Test 3: Specific error class hierarchy
// ============================================================================

// FetchNotFoundError instanceof HttpError is true
void (function testNotFoundErrorInstanceofHttpError() {
  const error = new FetchNotFoundError('Not found');

  // FetchNotFoundError should be instance of HttpError
  const _isHttpError: boolean = error instanceof HttpError;
});

// FetchNotFoundError instanceof FetchError is true
void (function testNotFoundErrorInstanceofFetchError() {
  const error = new FetchNotFoundError('Not found');

  // FetchNotFoundError should be instance of FetchError
  const _isFetchError: boolean = error instanceof FetchError;
});

// HttpError has status property
void (function testHttpErrorHasStatus() {
  const error = new HttpError(404, 'Not found', 'NOT_FOUND');

  // HttpError should have status property
  const status: number = error.status;
  const serverCode: string | undefined = error.serverCode;

  return { status, serverCode };
});

// Specific errors can be constructed with correct parameters
void (function testSpecificErrorsConstruction() {
  const badRequest = new FetchBadRequestError('Bad request');
  const unauthorized = new FetchUnauthorizedError('Unauthorized');
  const forbidden = new FetchForbiddenError('Forbidden');
  const notFound = new FetchNotFoundError('Not found');
  const conflict = new FetchConflictError('Conflict');
  const gone = new FetchGoneError('Gone');
  const unprocessable = new FetchUnprocessableEntityError('Unprocessable');
  const rateLimit = new FetchRateLimitError('Rate limited');
  const internal = new FetchInternalServerError('Internal error');
  const serviceUnavailable = new FetchServiceUnavailableError('Service unavailable');

  // Each specific error should have status as number (inherited from HttpError)
  const _br: number = badRequest.status;
  const _unauth: number = unauthorized.status;
  const _forbid: number = forbidden.status;
  const _nf: number = notFound.status;
  const _conf: number = conflict.status;
  const _gone: number = gone.status;
  const _unproc: number = unprocessable.status;
  const _rl: number = rateLimit.status;
  const _int: number = internal.status;
  const _su: number = serviceUnavailable.status;
});

// FetchNetworkError has correct code
void (function testNetworkErrorCode() {
  const error = new FetchNetworkError('Network failed');

  const _code: 'NETWORK_ERROR' = error.code;
});

// FetchTimeoutError has correct code
void (function testTimeoutErrorCode() {
  const error = new FetchTimeoutError('Timeout');

  const _code: 'TIMEOUT_ERROR' = error.code;
});

// ParseError has correct code and path
void (function testParseErrorCode() {
  const error = new ParseError('response', 'Parse failed', { invalid: true });

  const _code: 'PARSE_ERROR' = error.code;
  const _path: string = error.path;
  const _value: unknown = error.value;
});

// FetchValidationError has correct code and errors array
void (function testValidationErrorCode() {
  const error = new FetchValidationError('Validation failed', [
    { path: 'email', message: 'Invalid email' },
  ]);

  const _code: 'VALIDATION_ERROR' = error.code;
  const _errors: readonly { readonly path: string; readonly message: string }[] = error.errors;
});

// ============================================================================
// Test 4: Type exports verification
// ============================================================================

// Verify Result is properly exported and usable
void (function testResultExport() {
  // Result type should be importable and usable
  type UserResult = Result<{ id: string; name: string }, FetchError>;

  const okResult: UserResult = ok({ id: '1', name: 'Alice' });
  const errResult: UserResult = err(new FetchNotFoundError('Not found'));

  // Verify ok result has correct shape
  if (okResult.ok) {
    const user: { id: string; name: string } = okResult.data;
    return { user };
  }

  // Verify err result has correct shape
  if (!errResult.ok) {
    const error: FetchError = errResult.error;
    return { error };
  }
});

// Verify FetchErrorType union is properly constructed
void (function testFetchErrorTypeUnion() {
  // Should be able to create each error type
  const networkError: FetchErrorType = new FetchNetworkError();
  const httpError: FetchErrorType = new HttpError(500, 'Error');
  const badRequest: FetchErrorType = new FetchBadRequestError('Bad request');
  const notFound: FetchErrorType = new FetchNotFoundError('Not found');
  const timeout: FetchErrorType = new FetchTimeoutError();
  const parse: FetchErrorType = new ParseError('path', 'Parse error');
  const validation: FetchErrorType = new FetchValidationError('Invalid', []);

  return {
    networkError,
    httpError,
    badRequest,
    notFound,
    timeout,
    parse,
    validation,
  };
});

// ============================================================================
// Test 5: Generated SDK types
// ============================================================================

// SDK methods return Promise<Result<T, FetchError>>
// This simulates what the codegen generates
void (async function testSdkMethodReturnType() {
  // Simulate a generated SDK method return type
  // This is what client.get<T>() returns based on fetch package types
  type FetchResponse<T> = Result<{ data: T; status: number; headers: Headers }, FetchError>;

  // Simulated SDK method
  type GetUserMethod = () => Promise<FetchResponse<{ id: string; name: string }>>;

  const getUser: GetUserMethod = async () =>
    ok({ data: { id: '1', name: 'Alice' }, status: 200, headers: new Headers() });

  // Can await and get correct Result type
  const result = await getUser();

  // In ok branch, data is accessible
  if (result.ok) {
    const user: { id: string; name: string } = result.data.data;
    const status: number = result.data.status;
    const headers: Headers = result.data.headers;

    // @ts-expect-error - error should not be accessible in ok branch
    const _error: FetchError = result.error;

    return { user, status, headers };
  }

  // In err branch, error is FetchError
  if (!result.ok) {
    const error: FetchError = result.error;

    // @ts-expect-error - data should not be accessible in err branch
    const _data: { id: string; name: string } = result.data;

    return { error };
  }
});

// Result and FetchError are exported from SDK (fetch package)
void (function testFetchPackageExports() {
  // This tests that @vertz/fetch re-exports Result and FetchError correctly
  type ResultFromFetch = Result<string, FetchError>;
  type FetchErrorFromFetch = FetchError;

  const okResult: ResultFromFetch = ok('test');
  const errResult: ResultFromFetch = err(new FetchNotFoundError('Not found'));

  return { okResult, errResult };
});

// Generated SDK list method returns correct type
void (async function testSdkListMethodReturnType() {
  type FetchResponse<T> = Result<{ data: T; status: number; headers: Headers }, FetchError>;

  // Simulated list method (returns array)
  type ListUsersMethod = () => Promise<FetchResponse<{ id: string; name: string }[]>>;

  const listUsers: ListUsersMethod = async () =>
    ok({ data: [{ id: '1', name: 'Alice' }], status: 200, headers: new Headers() });

  const result = await listUsers();

  if (result.ok) {
    // data is array of users
    const users: { id: string; name: string }[] = result.data.data;
    const status: number = result.data.status;
    return { users, status };
  }
});

// Generated SDK create method returns correct type
void (async function testSdkCreateMethodReturnType() {
  type FetchResponse<T> = Result<{ data: T; status: number; headers: Headers }, FetchError>;

  type CreateUserInput = { name: string; email: string };
  type User = { id: string; name: string; email: string };

  // Simulated create method
  type CreateUserMethod = (body: CreateUserInput) => Promise<FetchResponse<User>>;

  const createUser: CreateUserMethod = async (body) =>
    ok({ data: { id: '1', ...body }, status: 201, headers: new Headers() });

  const result = await createUser({ name: 'Alice', email: 'alice@example.com' });

  if (result.ok) {
    const user: User = result.data.data;
    const status: number = result.data.status;
    return { user, status };
  }
});

// ============================================================================
// Test 6: Type guard inference
// ============================================================================

// Type guards should narrow types correctly
void (function testTypeGuards() {
  const error: FetchError = new FetchNotFoundError('Not found');

  if (isFetchNetworkError(error)) {
    const _e: FetchNetworkError = error;
  }

  if (isHttpError(error)) {
    const _e: HttpError = error;
  }

  if (isFetchNotFoundError(error)) {
    const _e: FetchNotFoundError = error;
  }

  if (isFetchBadRequestError(error)) {
    const _e: FetchBadRequestError = error;
  }

  if (isFetchTimeoutError(error)) {
    const _e: FetchTimeoutError = error;
  }

  if (isParseError(error)) {
    const _e: ParseError = error;
  }

  if (isFetchValidationError(error)) {
    const _e: FetchValidationError = error;
  }
});

// ============================================================================
// Test 7: matchError type inference
// ============================================================================

// matchError should infer return type correctly
void (function testMatchErrorReturnType() {
  const error: FetchErrorType = new FetchNotFoundError('Not found');

  const result = matchError(error, {
    NETWORK_ERROR: () => 'network',
    HTTP_ERROR: () => 'http',
    TIMEOUT_ERROR: () => 'timeout',
    PARSE_ERROR: () => 'parse',
    VALIDATION_ERROR: () => 'validation',
  });

  // Return type should be string
  const _result: string = result;
});

// matchError should work with different return types
void (function testMatchErrorDifferentReturnTypes() {
  const error: FetchErrorType = new FetchNotFoundError('Not found');

  const result = matchError(error, {
    NETWORK_ERROR: () => ({ type: 'network' }),
    HTTP_ERROR: (e) => ({ type: 'http', status: e.status }),
    TIMEOUT_ERROR: () => ({ type: 'timeout' }),
    PARSE_ERROR: (e) => ({ type: 'parse', path: e.path }),
    VALIDATION_ERROR: (e) => ({ type: 'validation', count: e.errors.length }),
  });

  // Return type should be an object with type property
  const _result: { type: string } = result;
});
