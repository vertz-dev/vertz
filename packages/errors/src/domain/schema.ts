/**
 * Schema validation errors.
 *
 * These errors are returned when schema validation fails.
 */

/**
 * Issue within a validation error.
 */
export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly code: string;
}

/**
 * Validation failed error.
 *
 * Returned when input doesn't match schema expectations.
 */
export interface ValidationError {
  readonly code: 'VALIDATION_FAILED';
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Creates a ValidationError.
 */
export function createValidationError(
  message: string,
  issues: readonly ValidationIssue[],
): ValidationError {
  return {
    code: 'VALIDATION_FAILED',
    message,
    issues,
  };
}

/**
 * Type guard for ValidationError.
 */
export function isValidationError(error: { readonly code: string }): error is ValidationError {
  return error.code === 'VALIDATION_FAILED';
}

/**
 * Union type for all schema errors.
 */
export type SchemaError = ValidationError;
