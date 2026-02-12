/** Options for formDataToObject conversion. */
export interface FormDataOptions {
  /** When true, coerces numeric strings to numbers and "true"/"false" to booleans. */
  coerce?: boolean;
}

/**
 * Convert FormData to a plain object.
 *
 * - File entries are skipped (only string values are included).
 * - Duplicate keys use the last value.
 * - When `coerce` is true, numeric strings become numbers and
 *   "true"/"false" become booleans.
 */
export function formDataToObject(
  formData: FormData,
  options?: FormDataOptions,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const coerce = options?.coerce ?? false;

  for (const [key, value] of formData.entries()) {
    // Skip File entries
    if (typeof value !== 'string') {
      continue;
    }

    result[key] = coerce ? coerceValue(value) : value;
  }

  return result;
}

/** Coerce a string value to a number or boolean if applicable. */
function coerceValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Check for numeric string (non-empty, finite number)
  if (value !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  return value;
}
