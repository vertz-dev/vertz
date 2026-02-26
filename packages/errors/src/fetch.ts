/**
 * Fetch error classes.
 *
 * These errors are used when making HTTP requests from the client.
 */

// ============================================================================
// Base class
// ============================================================================

/**
 * Base class for fetch errors.
 */
export abstract class FetchError extends Error {
  /**
   * The error code - a string literal for type-safe discrimination.
   */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

// ============================================================================
// NetworkError
// ============================================================================

/**
 * Network error - thrown when the request can't reach the server.
 *
 * @example
 * // When the server is unreachable
 * const result = await client.get('/users');
 * if (!result.ok && result.error.code === 'NETWORK_ERROR') {
 *   console.log('Network failed:', result.error.message);
 * }
 */
export class FetchNetworkError extends FetchError {
  readonly code = 'NetworkError' as const;

  constructor(message = 'Network request failed') {
    super('NetworkError', message);
    this.name = 'NetworkError';
  }
}

/**
 * Type guard for FetchNetworkError.
 */
export function isFetchNetworkError(error: unknown): error is FetchNetworkError {
  return error instanceof FetchNetworkError;
}

// ============================================================================
// HttpError (base for all HTTP errors)
// ============================================================================

/**
 * Base HTTP error - thrown when the server returns an error response.
 * Use specific error classes (BadRequestError, NotFoundError, etc.) when available.
 *
 * @example
 * const result = await client.get('/users/123');
 * if (!result.ok && result.error.code === 'HTTP_ERROR') {
 *   const httpError = result.error;
 *   console.log('Status:', httpError.status);      // e.g., 404
 *   console.log('Server code:', httpError.serverCode); // e.g., 'NOT_FOUND'
 *   console.log('Message:', httpError.message);
 * }
 */
export class HttpError extends FetchError {
  readonly code = 'HttpError' as const;

  /**
   * HTTP status code.
   */
  readonly status: number;

  /**
   * Server error code (from response body).
   */
  readonly serverCode?: string;

  constructor(status: number, message: string, serverCode?: string) {
    super('HttpError', message);
    this.name = 'HttpError';
    this.status = status;
    this.serverCode = serverCode;
  }
}

/**
 * Type guard for HttpError.
 */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

// ============================================================================
// Specific HTTP Errors (4xx Client Errors)
// ============================================================================

/**
 * Bad Request (400) - The request was invalid or cannot be served.
 */
export class FetchBadRequestError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 400;

  constructor(message: string, serverCode?: string) {
    super(400, message, serverCode);
    this.name = 'FetchBadRequestError';
  }
}

/**
 * Type guard for FetchBadRequestError.
 */
export function isFetchBadRequestError(error: unknown): error is FetchBadRequestError {
  return error instanceof FetchBadRequestError;
}

/**
 * Unauthorized (401) - Authentication is required or failed.
 */
export class FetchUnauthorizedError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 401;

  constructor(message: string, serverCode?: string) {
    super(401, message, serverCode);
    this.name = 'FetchUnauthorizedError';
  }
}

/**
 * Type guard for FetchUnauthorizedError.
 */
export function isFetchUnauthorizedError(error: unknown): error is FetchUnauthorizedError {
  return error instanceof FetchUnauthorizedError;
}

/**
 * Forbidden (403) - The request is understood but refused.
 */
export class FetchForbiddenError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 403;

  constructor(message: string, serverCode?: string) {
    super(403, message, serverCode);
    this.name = 'FetchForbiddenError';
  }
}

/**
 * Type guard for FetchForbiddenError.
 */
export function isFetchForbiddenError(error: unknown): error is FetchForbiddenError {
  return error instanceof FetchForbiddenError;
}

/**
 * Not Found (404) - The requested resource was not found.
 */
export class FetchNotFoundError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 404;

  constructor(message: string, serverCode?: string) {
    super(404, message, serverCode);
    this.name = 'FetchNotFoundError';
  }
}

/**
 * Type guard for FetchNotFoundError.
 */
export function isFetchNotFoundError(error: unknown): error is FetchNotFoundError {
  return error instanceof FetchNotFoundError;
}

/**
 * Conflict (409) - The request conflicts with current state.
 */
export class FetchConflictError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 409;

  constructor(message: string, serverCode?: string) {
    super(409, message, serverCode);
    this.name = 'FetchConflictError';
  }
}

/**
 * Type guard for FetchConflictError.
 */
export function isFetchConflictError(error: unknown): error is FetchConflictError {
  return error instanceof FetchConflictError;
}

/**
 * Gone (410) - The resource is no longer available.
 */
export class FetchGoneError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 410;

  constructor(message: string, serverCode?: string) {
    super(410, message, serverCode);
    this.name = 'FetchGoneError';
  }
}

/**
 * Type guard for FetchGoneError.
 */
export function isFetchGoneError(error: unknown): error is FetchGoneError {
  return error instanceof FetchGoneError;
}

/**
 * Unprocessable Entity (422) - The request was well-formed but semantically invalid.
 */
export class FetchUnprocessableEntityError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 422;

  constructor(message: string, serverCode?: string) {
    super(422, message, serverCode);
    this.name = 'FetchUnprocessableEntityError';
  }
}

/**
 * Type guard for FetchUnprocessableEntityError.
 */
export function isFetchUnprocessableEntityError(
  error: unknown,
): error is FetchUnprocessableEntityError {
  return error instanceof FetchUnprocessableEntityError;
}

/**
 * Rate Limited (429) - Too many requests.
 */
export class FetchRateLimitError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 429;

  constructor(message: string, serverCode?: string) {
    super(429, message, serverCode);
    this.name = 'FetchRateLimitError';
  }
}

/**
 * Type guard for FetchRateLimitError.
 */
export function isFetchRateLimitError(error: unknown): error is FetchRateLimitError {
  return error instanceof FetchRateLimitError;
}

// ============================================================================
// Specific HTTP Errors (5xx Server Errors)
// ============================================================================

/**
 * Internal Server Error (500) - The server encountered an error.
 */
export class FetchInternalServerError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 500;

  constructor(message: string, serverCode?: string) {
    super(500, message, serverCode);
    this.name = 'FetchInternalServerError';
  }
}

/**
 * Type guard for FetchInternalServerError.
 */
export function isFetchInternalServerError(error: unknown): error is FetchInternalServerError {
  return error instanceof FetchInternalServerError;
}

/**
 * Service Unavailable (503) - The server is temporarily unavailable.
 */
export class FetchServiceUnavailableError extends HttpError {
  readonly code = 'HttpError' as const;
  declare readonly status: 503;

  constructor(message: string, serverCode?: string) {
    super(503, message, serverCode);
    this.name = 'FetchServiceUnavailableError';
  }
}

/**
 * Type guard for FetchServiceUnavailableError.
 */
export function isFetchServiceUnavailableError(
  error: unknown,
): error is FetchServiceUnavailableError {
  return error instanceof FetchServiceUnavailableError;
}

// ============================================================================
// TimeoutError
// ============================================================================

/**
 * Timeout error - thrown when the request takes too long.
 *
 * @example
 * // Configure timeout in client options
 * const client = createClient({ baseURL: '...', timeout: 5000 });
 *
 * const result = await client.get('/slow-endpoint');
 * if (!result.ok && result.error.code === 'TIMEOUT_ERROR') {
 *   console.log('Request timed out:', result.error.message);
 *   // Retry the request
 * }
 */
export class FetchTimeoutError extends FetchError {
  readonly code = 'TimeoutError' as const;

  constructor(message = 'Request timed out') {
    super('TimeoutError', message);
    this.name = 'TimeoutError';
  }
}

/**
 * Type guard for FetchTimeoutError.
 */
export function isFetchTimeoutError(error: unknown): error is FetchTimeoutError {
  return error instanceof FetchTimeoutError;
}

// ============================================================================
// ParseError
// ============================================================================

/**
 * Parse error - thrown when response parsing fails.
 *
 * @example
 * // Server returns invalid JSON
 * const result = await client.get('/malformed');
 * if (!result.ok && result.error.code === 'PARSE_ERROR') {
 *   console.log('Parse failed at:', result.error.path);  // e.g., 'users.0.name'
 *   console.log('Invalid value:', result.error.value);
 * }
 */
export class ParseError extends FetchError {
  readonly code = 'ParseError' as const;

  /**
   * Path where parsing failed.
   */
  readonly path: string;

  /**
   * The value that failed to parse.
   */
  readonly value?: unknown;

  constructor(path: string, message: string, value?: unknown) {
    super('ParseError', message);
    this.name = 'ParseError';
    this.path = path;
    this.value = value;
  }
}

/**
 * Type guard for ParseError.
 */
export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}

// ============================================================================
// ValidationError
// ============================================================================

/**
 * Validation error - thrown when request validation fails.
 *
 * @example
 * // Server returns validation errors
 * const result = await client.post('/users', { name: '' });
 * if (!result.ok && result.error.code === 'VALIDATION_ERROR') {
 *   result.error.errors.forEach(err => {
 *     console.log(`Field: ${err.path}, Error: ${err.message}`);
 *   });
 * }
 *
 * @example
 * // Using with matchError for exhaustive handling
 * matchError(result.error, {
 *   VALIDATION_ERROR: (e) => setFormErrors(e.errors),
 *   NETWORK_ERROR: () => showNetworkError(),
 *   // ... other handlers
 * });
 */
export class FetchValidationError extends FetchError {
  readonly code = 'ValidationError' as const;

  /**
   * Validation errors matching server format.
   */
  readonly errors: readonly {
    readonly path: string;
    readonly message: string;
  }[];

  constructor(
    message: string,
    errors: readonly {
      readonly path: string;
      readonly message: string;
    }[],
  ) {
    super('ValidationError', message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Type guard for FetchValidationError.
 */
export function isFetchValidationError(error: unknown): error is FetchValidationError {
  return error instanceof FetchValidationError;
}

// ============================================================================
// Helper function to create error from status code
// ============================================================================

/**
 * Creates the appropriate error class based on HTTP status code.
 */
export function createHttpError(status: number, message: string, serverCode?: string): FetchError {
  switch (status) {
    case 400:
      return new FetchBadRequestError(message, serverCode);
    case 401:
      return new FetchUnauthorizedError(message, serverCode);
    case 403:
      return new FetchForbiddenError(message, serverCode);
    case 404:
      return new FetchNotFoundError(message, serverCode);
    case 409:
      return new FetchConflictError(message, serverCode);
    case 410:
      return new FetchGoneError(message, serverCode);
    case 422:
      return new FetchUnprocessableEntityError(message, serverCode);
    case 429:
      return new FetchRateLimitError(message, serverCode);
    case 500:
      return new FetchInternalServerError(message, serverCode);
    case 503:
      return new FetchServiceUnavailableError(message, serverCode);
    default:
      return new HttpError(status, message, serverCode);
  }
}

// ============================================================================
// Union types
// ============================================================================

/**
 * Union type for all fetch errors.
 *
 * @example
 * import { matchError, FetchErrorType } from '@vertz/errors';
 *
 * // Using with matchError for exhaustive handling
 * function handleError(error: FetchErrorType): string {
 *   return matchError(error, {
 *     NETWORK_ERROR: (e) => `Network failed: ${e.message}`,
 *     HTTP_ERROR: (e) => `HTTP ${e.status}: ${e.message}`,
 *     TIMEOUT_ERROR: (e) => `Timeout: ${e.message}`,
 *     PARSE_ERROR: (e) => `Parse failed at ${e.path}`,
 *     VALIDATION_ERROR: (e) => `Validation: ${e.errors.length} errors`,
 *   });
 * }
 *
 * @example
 * // Using with Result
 * const result = await client.get<User>('/users/123');
 * const errorMessage = result.ok ? '' : handleError(result.error);
 */
export type FetchErrorType =
  | FetchNetworkError
  | HttpError
  | FetchBadRequestError
  | FetchUnauthorizedError
  | FetchForbiddenError
  | FetchNotFoundError
  | FetchConflictError
  | FetchGoneError
  | FetchUnprocessableEntityError
  | FetchRateLimitError
  | FetchInternalServerError
  | FetchServiceUnavailableError
  | FetchTimeoutError
  | ParseError
  | FetchValidationError;
