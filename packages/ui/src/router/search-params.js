/**
 * Search params parsing and reactive access.
 */
/**
 * Parse URLSearchParams into a typed object, optionally through a schema.
 *
 * @param urlParams - The raw URLSearchParams
 * @param schema - Optional schema with a `parse` method for validation/coercion
 * @returns Parsed search params object
 */
export function parseSearchParams(urlParams, schema) {
  const raw = {};
  for (const [key, value] of urlParams.entries()) {
    raw[key] = value;
  }
  if (schema) {
    return schema.parse(raw);
  }
  return raw;
}
/**
 * Read the current search params from a reactive signal.
 * Intended to be called inside a reactive context (effect/computed).
 *
 * @param searchSignal - Signal holding the current parsed search params
 * @returns The current search params value
 */
export function useSearchParams(searchSignal) {
  return searchSignal.value;
}
//# sourceMappingURL=search-params.js.map
