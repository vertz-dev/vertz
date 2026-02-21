/**
 * Minimal schema interface compatible with @vertz/schema.
 * Any object with a `parse(data: unknown): T` method satisfies this.
 */
export interface FormSchema<T> {
  parse(data: unknown): T;
}

/** Result of a validation attempt. */
export type ValidationResult<T> =
  | { success: true; data: T; errors: Record<string, never> }
  | { success: false; data: undefined; errors: Record<string, string> };

/**
 * Validate data against a schema.
 *
 * - On success, returns `{ success: true, data, errors: {} }`.
 * - On failure, extracts field errors from `error.fieldErrors` if present,
 *   otherwise falls back to a generic `_form` error.
 */
export function validate<T>(schema: FormSchema<T>, data: unknown): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed, errors: {} as Record<string, never> };
  } catch (err: unknown) {
    if (err instanceof Error) {
      // Check for field-level errors (convention: error.fieldErrors)
      const fieldErrors = (err as Error & { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        return { success: false, data: undefined, errors: fieldErrors };
      }

      // Check for @vertz/schema ParseError (duck-typed: .issues array)
      const issues = (err as Error & { issues?: { path: (string | number)[]; message: string }[] })
        .issues;
      if (Array.isArray(issues) && issues.length > 0) {
        const errors: Record<string, string> = {};
        for (const issue of issues) {
          const key =
            Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : '_form';
          if (!(key in errors)) {
            errors[key] = issue.message ?? 'Validation failed';
          }
        }
        return { success: false, data: undefined, errors };
      }

      return { success: false, data: undefined, errors: { _form: err.message } };
    }
    return { success: false, data: undefined, errors: { _form: 'Validation failed' } };
  }
}
