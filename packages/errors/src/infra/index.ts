/**
 * Infrastructure errors.
 *
 * These are operational failures that the application developer never handles
 * in business logic. They're caught by global middleware/error boundaries
 * and result in 500/503 responses.
 */

/**
 * Base class for infrastructure errors.
 */
export class InfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Database connection error.
 *
 * Thrown when the database is unreachable.
 */
export class ConnectionError extends InfraError {
  constructor(message = 'Database connection failed') {
    super(message);
  }
}

/**
 * Connection pool exhausted error.
 *
 * Thrown when no connections are available in the pool.
 */
export class PoolExhaustedError extends InfraError {
  constructor(message = 'Database pool exhausted') {
    super(message);
  }
}

/**
 * Query error.
 *
 * Thrown when a query fails (malformed, syntax error, etc.).
 */
export class QueryError extends InfraError {
  constructor(message = 'Query execution failed') {
    super(message);
  }
}

/**
 * Timeout error.
 *
 * Thrown when an operation takes too long.
 */
export class TimeoutError extends InfraError {
  constructor(message = 'Operation timed out') {
    super(message);
  }
}

/**
 * Network error.
 *
 * Thrown when HTTP client can't reach the server.
 */
export class NetworkError extends InfraError {
  constructor(message = 'Network request failed') {
    super(message);
  }
}

/**
 * Serialization error.
 *
 * Thrown when response couldn't be decoded.
 */
export class SerializationError extends InfraError {
  constructor(message = 'Failed to decode response') {
    super(message);
  }
}

/**
 * Union type for all infrastructure errors.
 */
export type InfraErrors =
  | ConnectionError
  | PoolExhaustedError
  | QueryError
  | TimeoutError
  | NetworkError
  | SerializationError;
