/**
 * Minimal schema interface compatible with @vertz/schema.
 * Any object with a `parse(data: unknown): Result` method satisfies this.
 */
export interface FormSchema<T> {
  parse(data: unknown): { ok: true; data: T } | { ok: false; error: unknown };
}

/** Result of a validation attempt. */
export type ValidationResult<T> =
  | { success: true; data: T; errors: Record<string, never> }
  | { success: false; data: undefined; errors: Record<string, string> };

/** Result of a single-field validation. */
export type FieldValidationResult =
  | { valid: true; error: undefined }
  | { valid: false; error: string };

/**
 * Validate data against a schema.
 *
 * - On success, returns `{ success: true, data, errors: {} }`.
 * - On failure, extracts field errors from `error.fieldErrors` if present,
 *   otherwise falls back to a generic `_form` error.
 */
export function validate<T>(schema: FormSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.parse(data);

  if (result.ok) {
    return { success: true, data: result.data, errors: {} as Record<string, never> };
  }

  const err = result.error;
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

/**
 * Check if a value looks like a schema (has a `.parse` method).
 */
function isSchemaLike(value: unknown): value is { parse(data: unknown): unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'parse' in value &&
    typeof (value as Record<string, unknown>).parse === 'function'
  );
}

function unwrapToShape(value: unknown): unknown {
  let current = value;
  let unwrapCount = 0;
  while (
    current &&
    typeof current === 'object' &&
    'unwrap' in current &&
    typeof (current as Record<string, unknown>).unwrap === 'function' &&
    !(current as Record<string, unknown>).shape &&
    unwrapCount < 10
  ) {
    current = (current as { unwrap(): unknown }).unwrap();
    unwrapCount++;
  }
  return current;
}

/**
 * Try to resolve a single-field schema by traversing `.shape` and unwrapping
 * OptionalSchema/DefaultSchema/NullableSchema/RefinedSchema/SuperRefinedSchema
 * (via `.unwrap()`) at the top level and at each intermediate path segment.
 * Returns the field schema if found, or undefined if traversal fails.
 */
export function resolveFieldSchema(
  schema: FormSchema<unknown>,
  fieldPath: string,
): { parse(data: unknown): unknown } | undefined {
  const unwrapped = unwrapToShape(schema);
  const shape = (unwrapped as Record<string, unknown> | undefined)?.shape;
  if (!shape || typeof shape !== 'object') return undefined;

  const segments = fieldPath.split('.');
  let current: unknown = shape;

  for (let i = 0; i < segments.length; i++) {
    if (!current || typeof current !== 'object') return undefined;

    const segment = segments[i]!;
    let fieldSchema = (current as Record<string, unknown>)[segment];

    // If this is NOT the last segment, we need to descend into the next level's .shape
    if (i < segments.length - 1) {
      fieldSchema = unwrapToShape(fieldSchema);

      // Get .shape for the next level
      if (
        fieldSchema &&
        typeof fieldSchema === 'object' &&
        'shape' in fieldSchema &&
        typeof (fieldSchema as Record<string, unknown>).shape === 'object'
      ) {
        current = (fieldSchema as { shape: unknown }).shape;
      } else {
        return undefined;
      }
    } else {
      // Last segment — this should be the field schema
      if (isSchemaLike(fieldSchema)) {
        return fieldSchema;
      }
      return undefined;
    }
  }

  return undefined;
}

/**
 * Extract an error message from a parse failure.
 */
function extractErrorFromParseResult(result: { ok: false; error: unknown }): string {
  const err = result.error;
  if (err instanceof Error) {
    const issues = (err as Error & { issues?: { path: (string | number)[]; message: string }[] })
      .issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues[0]!.message ?? 'Validation failed';
    }
    return err.message;
  }
  return 'Validation failed';
}

/**
 * Validate a single field against a schema.
 *
 * - If the schema exposes `.shape`, resolves the field's individual schema
 *   (unwrapping Optional/Default/Nullable wrappers) and validates directly.
 * - Otherwise, falls back to full-form validation and extracts the field's error.
 *
 * @param schema - The form schema
 * @param fieldName - Dot-path field name (e.g., "title" or "address.street")
 * @param value - The current field value
 * @param formData - Full form data for fallback validation (required when schema has no .shape)
 */
export function validateField<T>(
  schema: FormSchema<T>,
  fieldName: string,
  value: unknown,
  formData?: Record<string, unknown>,
): FieldValidationResult {
  // Try single-field path via .shape traversal
  const fieldSchema = resolveFieldSchema(schema, fieldName);
  if (fieldSchema) {
    const result = fieldSchema.parse(value) as { ok: boolean; error?: unknown };
    if (result.ok) {
      return { valid: true, error: undefined };
    }
    const error = extractErrorFromParseResult(result as { ok: false; error: unknown });
    return { valid: false, error };
  }

  // Fallback: full-form validation + extract field error
  if (formData) {
    const result = validate(schema, formData);
    if (result.success) {
      return { valid: true, error: undefined };
    }
    const fieldError = result.errors[fieldName];
    if (fieldError) {
      return { valid: false, error: fieldError };
    }
    return { valid: true, error: undefined };
  }

  // No .shape and no formData — can't validate
  return { valid: true, error: undefined };
}
