/**
 * Validate data against a schema.
 *
 * - On success, returns `{ success: true, data, errors: {} }`.
 * - On failure, extracts field errors from `error.fieldErrors` if present,
 *   otherwise falls back to a generic `_form` error.
 */
export function validate(schema, data) {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed, errors: {} };
  } catch (err) {
    if (err instanceof Error) {
      // Check for field-level errors (convention: error.fieldErrors)
      const fieldErrors = err.fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        return { success: false, data: undefined, errors: fieldErrors };
      }
      return { success: false, data: undefined, errors: { _form: err.message } };
    }
    return { success: false, data: undefined, errors: { _form: 'Validation failed' } };
  }
}
//# sourceMappingURL=validation.js.map
