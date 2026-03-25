/**
 * Shallow merge two objects. Fields in `incoming` overwrite fields in `existing`.
 * Fields not in `incoming` are preserved. Undefined values in `incoming` are ignored.
 *
 * Arrays and nested objects are REPLACED, not deep-merged.
 */
export function shallowMerge<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
): T {
  const result = { ...existing };

  for (const key of Object.keys(incoming)) {
    const value = incoming[key as keyof T];
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level bound requires any
      (result as any)[key] = value;
    }
  }

  return result;
}

/**
 * Shallow equality check. Returns true if both objects have the same keys
 * and values (strict reference equality for each value).
 */
export function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    const valA = a[key];
    const valB = b[key];

    if (valA !== valB) {
      if (Array.isArray(valA) && Array.isArray(valB)) {
        if (valA.length !== valB.length) return false;
        for (let i = 0; i < valA.length; i++) {
          if (valA[i] !== valB[i]) return false;
        }
        continue;
      }
      return false;
    }
  }

  return true;
}
