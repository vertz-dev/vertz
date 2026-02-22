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
// HttpError
// ============================================================================

/**
 * HTTP error - thrown when the server returns an error response.
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
// Union types
// ============================================================================

/**
 * Union type for all fetch errors.
 */
export type FetchErrorType =
  | FetchNetworkError
  | HttpError
  | FetchTimeoutError
  | ParseError
  | FetchValidationError;
