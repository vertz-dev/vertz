/**
 * Database domain errors.
 *
 * These errors are returned from DB operations and represent
 * expected runtime failures that require case-by-case handling.
 */

// ============================================================================
// Read Errors
// ============================================================================

/**
 * Record not found error.
 *
 * Returned when a required record is not found (from findOneRequired).
 * Note: findOne() returns Result<T | null, never> - null is success.
 */
export interface NotFoundError {
  readonly code: 'NotFound';
  readonly message: string;
  readonly table: string;
  readonly key?: Record<string, unknown>;
}

/**
 * Creates a NotFoundError.
 */
export function createNotFoundError(table: string, key?: Record<string, unknown>): NotFoundError {
  const keyStr = key ? JSON.stringify(key) : '';
  return {
    code: 'NotFound',
    message: `Record not found in ${table}${keyStr ? `: ${keyStr}` : ''}`,
    table,
    key,
  };
}

/**
 * Type guard for NotFoundError.
 */
export function isNotFoundError(error: { readonly code: string }): error is NotFoundError {
  return error.code === 'NotFound';
}

/**
 * Union type for all read errors.
 */
export type ReadError = NotFoundError;

// ============================================================================
// Write Errors
// ============================================================================

/**
 * Unique constraint violation.
 *
 * Returned when inserting/updating a record would violate a unique constraint.
 */
export interface UniqueViolation {
  readonly code: 'UNIQUE_VIOLATION';
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
}

/**
 * Creates a UniqueViolation error.
 */
export function createUniqueViolation(
  message: string,
  options?: { constraint?: string; table?: string; column?: string },
): UniqueViolation {
  return {
    code: 'UNIQUE_VIOLATION',
    message,
    ...options,
  };
}

/**
 * Type guard for UniqueViolation.
 */
export function isUniqueViolation(error: { readonly code: string }): error is UniqueViolation {
  return error.code === 'UNIQUE_VIOLATION';
}

/**
 * Foreign key violation.
 *
 * Returned when inserting/updating a record references a non-existent record.
 */
export interface FKViolation {
  readonly code: 'FK_VIOLATION';
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
  readonly referencedTable?: string;
}

/**
 * Creates a FKViolation error.
 */
export function createFKViolation(
  message: string,
  options?: {
    constraint?: string;
    table?: string;
    column?: string;
    referencedTable?: string;
  },
): FKViolation {
  return {
    code: 'FK_VIOLATION',
    message,
    ...options,
  };
}

/**
 * Type guard for FKViolation.
 */
export function isFKViolation(error: { readonly code: string }): error is FKViolation {
  return error.code === 'FK_VIOLATION';
}

/**
 * Not null violation.
 *
 * Returned when inserting/updating a record would violate a NOT NULL constraint.
 */
export interface NotNullViolation {
  readonly code: 'NOT_NULL_VIOLATION';
  readonly message: string;
  readonly table?: string;
  readonly column?: string;
}

/**
 * Creates a NotNullViolation error.
 */
export function createNotNullViolation(
  message: string,
  options?: { table?: string; column?: string },
): NotNullViolation {
  return {
    code: 'NOT_NULL_VIOLATION',
    message,
    ...options,
  };
}

/**
 * Type guard for NotNullViolation.
 */
export function isNotNullViolation(error: { readonly code: string }): error is NotNullViolation {
  return error.code === 'NOT_NULL_VIOLATION';
}

/**
 * Check constraint violation.
 *
 * Returned when inserting/updating a record would violate a CHECK constraint.
 */
export interface CheckViolation {
  readonly code: 'CHECK_VIOLATION';
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
}

/**
 * Creates a CheckViolation error.
 */
export function createCheckViolation(
  message: string,
  options?: { constraint?: string; table?: string },
): CheckViolation {
  return {
    code: 'CHECK_VIOLATION',
    message,
    ...options,
  };
}

/**
 * Type guard for CheckViolation.
 */
export function isCheckViolation(error: { readonly code: string }): error is CheckViolation {
  return error.code === 'CHECK_VIOLATION';
}

/**
 * Union type for all write errors.
 */
export type WriteError = UniqueViolation | FKViolation | NotNullViolation | CheckViolation;

// ============================================================================
// Combined Types
// ============================================================================

/**
 * Union type for all database errors.
 */
export type DBError = ReadError | WriteError;
