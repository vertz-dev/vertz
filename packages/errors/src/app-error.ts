/**
 * AppError - Base class for custom domain errors thrown by app developers.
 *
 * This is the standard way for app developers to define and throw domain errors.
 * The server boundary catches these errors and maps them to HTTP responses.
 *
 * @example
 * class InsufficientBalanceError extends AppError<'INSUFFICIENT_BALANCE'> {
 *   constructor(public readonly required: number, public readonly available: number) {
 *     super('INSUFFICIENT_BALANCE', `Need ${required}, have ${available}`);
 *   }
 *
 *   toJSON() {
 *     return { ...super.toJSON(), required: this.required, available: this.available };
 *   }
 * }
 *
 * throw new InsufficientBalanceError(500, 50);
 */

/**
 * Base class for application domain errors.
 *
 * Extends Error and adds a typed code property for discrimination.
 * Subclasses can add custom fields and override toJSON() for serialization.
 */
export class AppError<C extends string = string> extends Error {
  /**
   * The error code - a string literal for type-safe discrimination.
   */
  readonly code: C;

  /**
   * Creates a new AppError.
   *
   * @param code - The error code (string literal type)
   * @param message - Human-readable error message
   */
  constructor(code: C, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }

  /**
   * Serializes the error to a plain object for HTTP responses.
   * Override in subclasses to include additional fields.
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
    };
  }
}
