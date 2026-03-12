/** Options for formDataToObject conversion. */
export interface FormDataOptions {
  /** When true, coerces numeric strings to numbers and "true"/"false" to booleans. */
  coerce?: boolean;
  /** When true, parses dot-separated keys into nested objects (e.g., "address.street" → { address: { street: ... } }). */
  nested?: boolean;
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
  const nested = options?.nested ?? false;

  for (const [key, value] of formData.entries()) {
    // Skip File entries
    if (typeof value !== 'string') {
      continue;
    }

    const coerced = coerce ? coerceValue(value) : value;
    if (nested && key.includes('.')) {
      setNestedValue(result, key, coerced);
    } else {
      result[key] = coerced;
    }
  }

  return result;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Set a value at a dot-separated path in a nested object. Numeric segments create arrays. */
function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    if (DANGEROUS_KEYS.has(segment)) return;
    const nextSegment = segments[i + 1]!;
    const isNextArray = /^\d+$/.test(nextSegment);
    if (!(segment in current)) {
      current[segment] = isNextArray ? [] : {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const lastSegment = segments[segments.length - 1]!;
  if (DANGEROUS_KEYS.has(lastSegment)) return;
  current[lastSegment] = value;
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
