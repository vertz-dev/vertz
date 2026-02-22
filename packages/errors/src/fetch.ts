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
 */
export class FetchNetworkError extends FetchError {
  readonly code = 'NETWORK_ERROR' as const;

  constructor(message = 'Network request failed') {
    super('NETWORK_ERROR', message);
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
 */
export class HttpError extends FetchError {
  readonly code = 'HTTP_ERROR' as const;

  /**
   * HTTP status code.
   */
  readonly status: number;

  /**
   * Server error code (from response body).
   */
  readonly serverCode?: string;

  constructor(status: number, message: string, serverCode?: string) {
    super('HTTP_ERROR', message);
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
export class FetchBadRequestError extends FetchError {
  readonly code = 'FETCH_BAD_REQUEST' as const;
  readonly status = 400 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_BAD_REQUEST', message);
    this.name = 'FetchBadRequestError';
    this.serverCode = serverCode;
  }
}

/**
 * Unauthorized (401) - Authentication is required or failed.
 */
export class FetchUnauthorizedError extends FetchError {
  readonly code = 'FETCH_UNAUTHORIZED' as const;
  readonly status = 401 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_UNAUTHORIZED', message);
    this.name = 'FetchUnauthorizedError';
    this.serverCode = serverCode;
  }
}

/**
 * Forbidden (403) - The request is understood but refused.
 */
export class FetchForbiddenError extends FetchError {
  readonly code = 'FETCH_FORBIDDEN' as const;
  readonly status = 403 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_FORBIDDEN', message);
    this.name = 'FetchForbiddenError';
    this.serverCode = serverCode;
  }
}

/**
 * Not Found (404) - The requested resource was not found.
 */
export class FetchNotFoundError extends FetchError {
  readonly code = 'FETCH_NOT_FOUND' as const;
  readonly status = 404 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_NOT_FOUND', message);
    this.name = 'FetchNotFoundError';
    this.serverCode = serverCode;
  }
}

/**
 * Conflict (409) - The request conflicts with current state.
 */
export class FetchConflictError extends FetchError {
  readonly code = 'FETCH_CONFLICT' as const;
  readonly status = 409 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_CONFLICT', message);
    this.name = 'FetchConflictError';
    this.serverCode = serverCode;
  }
}

/**
 * Gone (410) - The resource is no longer available.
 */
export class FetchGoneError extends FetchError {
  readonly code = 'FETCH_GONE' as const;
  readonly status = 410 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_GONE', message);
    this.name = 'FetchGoneError';
    this.serverCode = serverCode;
  }
}

/**
 * Unprocessable Entity (422) - The request was well-formed but semantically invalid.
 */
export class FetchUnprocessableEntityError extends FetchError {
  readonly code = 'FETCH_UNPROCESSABLE_ENTITY' as const;
  readonly status = 422 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_UNPROCESSABLE_ENTITY', message);
    this.name = 'FetchUnprocessableEntityError';
    this.serverCode = serverCode;
  }
}

/**
 * Rate Limited (429) - Too many requests.
 */
export class FetchRateLimitError extends FetchError {
  readonly code = 'FETCH_RATE_LIMITED' as const;
  readonly status = 429 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_RATE_LIMITED', message);
    this.name = 'FetchRateLimitError';
    this.serverCode = serverCode;
  }
}

// ============================================================================
// Specific HTTP Errors (5xx Server Errors)
// ============================================================================

/**
 * Internal Server Error (500) - The server encountered an error.
 */
export class FetchInternalServerError extends FetchError {
  readonly code = 'FETCH_INTERNAL_SERVER_ERROR' as const;
  readonly status = 500 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_INTERNAL_SERVER_ERROR', message);
    this.name = 'FetchInternalServerError';
    this.serverCode = serverCode;
  }
}

/**
 * Service Unavailable (503) - The server is temporarily unavailable.
 */
export class FetchServiceUnavailableError extends FetchError {
  readonly code = 'FETCH_SERVICE_UNAVAILABLE' as const;
  readonly status = 503 as const;
  readonly serverCode?: string;

  constructor(message: string, serverCode?: string) {
    super('FETCH_SERVICE_UNAVAILABLE', message);
    this.name = 'FetchServiceUnavailableError';
    this.serverCode = serverCode;
  }
}

// ============================================================================
// TimeoutError
// ============================================================================

/**
 * Timeout error - thrown when the request takes too long.
 */
export class FetchTimeoutError extends FetchError {
  readonly code = 'TIMEOUT_ERROR' as const;

  constructor(message = 'Request timed out') {
    super('TIMEOUT_ERROR', message);
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
 */
export class ParseError extends FetchError {
  readonly code = 'PARSE_ERROR' as const;

  /**
   * Path where parsing failed.
   */
  readonly path: string;

  /**
   * The value that failed to parse.
   */
  readonly value?: unknown;

  constructor(path: string, message: string, value?: unknown) {
    super('PARSE_ERROR', message);
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
 */
export class FetchValidationError extends FetchError {
  readonly code = 'VALIDATION_ERROR' as const;

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
    super('VALIDATION_ERROR', message);
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
