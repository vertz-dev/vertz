/**
 * Error types for @vertz/db Result return types.
 *
 * This module provides:
 * 1. Re-exports of all existing error classes from ./errors (db-error, pg-parser, etc.)
 * 2. New type definitions for ReadError and WriteError unions
 * 3. Helper functions to convert raw errors to typed errors
 */

// Type-only re-exports from db-error.ts
export type { DbErrorJson } from './errors/db-error';
// Re-export everything from the errors folder for backward compatibility
export * from './errors/index';

// Re-export from pg-parser
export type { PgErrorInput } from './errors/pg-parser';

// ---------------------------------------------------------------------------
// New Result error types
// ---------------------------------------------------------------------------

import {
  CheckConstraintError,
  ConnectionError,
  ForeignKeyError,
  JsonbParseError,
  JsonbValidationError,
  NotNullError,
  UniqueConstraintError,
} from './errors/db-error';

/**
 * Base interface for database errors with code, message, and optional cause.
 */
export interface DbErrorBase {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

/**
 * Connection errors - failed to connect or connection lost.
 */
export interface DbConnectionError extends DbErrorBase {
  readonly code: 'CONNECTION_ERROR';
}

/**
 * Query execution errors - SQL syntax, timeout, etc.
 */
export interface DbQueryError extends DbErrorBase {
  readonly code: 'QUERY_ERROR';
  readonly sql?: string;
}

/**
 * Constraint violations - unique, foreign key, not null, check.
 */
export interface DbConstraintError extends DbErrorBase {
  readonly code: 'CONSTRAINT_ERROR';
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
}

/**
 * Record not found - for getOrThrow, update, delete operations.
 */
export interface DbNotFoundError extends DbErrorBase {
  readonly code: 'NotFound';
  readonly table: string;
}

/**
 * A JSONB TEXT cell on SQLite/D1 could not be parsed back into an object.
 * Data-integrity failure — typically corruption or a column type mismatch.
 */
export interface DbJsonbParseError extends DbErrorBase {
  readonly code: 'JSONB_PARSE_ERROR';
  readonly table?: string;
  readonly column?: string;
  readonly columnType: string;
}

/**
 * A validator attached to a `d.jsonb<T>()` column rejected the parsed value on read.
 */
export interface DbJsonbValidationError extends DbErrorBase {
  readonly code: 'JSONB_VALIDATION_ERROR';
  readonly table: string;
  readonly column: string;
  readonly value: unknown;
}

/**
 * Read operations can fail with connection errors, query errors, not found,
 * or JSONB parse / validator failures on SQLite dialects.
 */
export type ReadError =
  | DbConnectionError
  | DbQueryError
  | DbNotFoundError
  | DbJsonbParseError
  | DbJsonbValidationError;

/**
 * Write operations can fail with connection errors, query errors, or constraint violations.
 */
export type WriteError = DbConnectionError | DbQueryError | DbConstraintError;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Maps a raw error to a ReadError.
 * Categorizes PostgreSQL errors into appropriate error types.
 */
export function toReadError(error: unknown, query?: string): ReadError {
  // Preserve the discriminating code for typed framework errors. Must be
  // checked before the generic `code`-sniffing path below, which otherwise
  // collapses every DbError subclass into QUERY_ERROR.
  if (error instanceof JsonbParseError) {
    const variant: DbJsonbParseError = {
      code: 'JSONB_PARSE_ERROR',
      message: error.message,
      columnType: error.columnType,
      cause: error,
    };
    const withTable = error.table !== undefined ? { ...variant, table: error.table } : variant;
    return error.column !== undefined ? { ...withTable, column: error.column } : withTable;
  }
  if (error instanceof JsonbValidationError) {
    return {
      code: 'JSONB_VALIDATION_ERROR',
      message: error.message,
      table: error.table,
      column: error.column,
      value: error.value,
      cause: error,
    };
  }

  // Check for error with code property first (includes DbError subclasses)
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const errWithCode = error as {
      code: string;
      message: string;
      table?: string;
      constraint?: string;
    };

    // Check for NotFound code (from NotFoundError)
    if (errWithCode.code === 'NotFound') {
      return {
        code: 'NotFound',
        message: errWithCode.message,
        table: errWithCode.table ?? 'unknown',
        cause: error,
      };
    }

    // Connection error codes start with 08
    if (errWithCode.code.startsWith('08')) {
      return {
        code: 'CONNECTION_ERROR',
        message: errWithCode.message,
        cause: error,
      };
    }

    // Query errors
    return {
      code: 'QUERY_ERROR',
      message: errWithCode.message,
      sql: query,
      cause: error,
    };
  }

  // Connection error - try to detect from message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('connection') ||
      message.includes('ECONNREFUSED') ||
      message.includes('timeout')
    ) {
      return {
        code: 'CONNECTION_ERROR',
        message: error.message,
        cause: error,
      };
    }
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'QUERY_ERROR',
    message,
    sql: query,
    cause: error,
  };
}

/**
 * Maps a raw error to a WriteError.
 * Categorizes PostgreSQL errors into appropriate error types.
 */
export function toWriteError(error: unknown, query?: string): WriteError {
  // Already a DbError subclass - constraint errors
  if (error instanceof UniqueConstraintError) {
    return {
      code: 'CONSTRAINT_ERROR',
      message: error.message,
      column: error.column,
      table: error.table,
      cause: error,
    };
  }

  if (error instanceof ForeignKeyError) {
    return {
      code: 'CONSTRAINT_ERROR',
      message: error.message,
      constraint: error.constraint,
      table: error.table,
      cause: error,
    };
  }

  if (error instanceof NotNullError) {
    return {
      code: 'CONSTRAINT_ERROR',
      message: error.message,
      column: error.column,
      table: error.table,
      cause: error,
    };
  }

  if (error instanceof CheckConstraintError) {
    return {
      code: 'CONSTRAINT_ERROR',
      message: error.message,
      constraint: error.constraint,
      table: error.table,
      cause: error,
    };
  }

  if (error instanceof ConnectionError) {
    return {
      code: 'CONNECTION_ERROR',
      message: error.message,
      cause: error,
    };
  }

  // PostgreSQL error
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const pgError = error as {
      code: string;
      message: string;
      table?: string;
      constraint?: string;
      column?: string;
    };

    // Connection error codes start with 08
    if (pgError.code.startsWith('08')) {
      return {
        code: 'CONNECTION_ERROR',
        message: pgError.message,
        cause: error,
      };
    }

    // Constraint violations (23505, 23503, 23502, 23514)
    if (
      pgError.code === '23505' || // unique_violation
      pgError.code === '23503' || // foreign_key_violation
      pgError.code === '23502' || // not_null_violation
      pgError.code === '23514' // check_violation
    ) {
      // 23505 (unique) and 23502 (not null) use column field
      // 23503 (FK) and 23514 (check) use constraint field
      if (pgError.code === '23505' || pgError.code === '23502') {
        return {
          code: 'CONSTRAINT_ERROR',
          message: pgError.message,
          table: pgError.table,
          column: pgError.column,
          cause: error,
        };
      } else {
        return {
          code: 'CONSTRAINT_ERROR',
          message: pgError.message,
          table: pgError.table,
          constraint: pgError.constraint,
          cause: error,
        };
      }
    }

    // Other query errors
    return {
      code: 'QUERY_ERROR',
      message: pgError.message,
      sql: query,
      cause: error,
    };
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'QUERY_ERROR',
    message,
    sql: query,
    cause: error,
  };
}
