/**
 * Minimal schema interface compatible with @vertz/schema.
 * Any object with a `parse(data: unknown): T` method satisfies this.
 */
export interface FormSchema<T> {
  parse(data: unknown): T;
}
/** Result of a validation attempt. */
export type ValidationResult<T> =
  | {
      success: true;
      data: T;
      errors: Record<string, never>;
    }
  | {
      success: false;
      data: undefined;
      errors: Record<string, string>;
    };
/**
 * Validate data against a schema.
 *
 * - On success, returns `{ success: true, data, errors: {} }`.
 * - On failure, extracts field errors from `error.fieldErrors` if present,
 *   otherwise falls back to a generic `_form` error.
 */
export declare function validate<T>(schema: FormSchema<T>, data: unknown): ValidationResult<T>;
//# sourceMappingURL=validation.d.ts.map
