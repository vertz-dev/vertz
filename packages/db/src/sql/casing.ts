/**
 * Casing conversion utilities for camelCase <-> snake_case.
 *
 * Used by SQL builders to convert JavaScript property names (camelCase)
 * to PostgreSQL column names (snake_case) and vice versa.
 */

/**
 * Override map for custom casing conversions.
 * Keys are camelCase, values are snake_case.
 * Example: { 'oAuth': 'oauth', 'userID': 'user_id' }
 */
export type CasingOverrides = Record<string, string>;

/**
 * Convert a camelCase string to snake_case.
 *
 * Handles acronyms correctly:
 * - "parseJSON" -> "parse_json"
 * - "getHTTPSUrl" -> "get_https_url"
 * - "htmlParser" -> "html_parser"
 *
 * @param str - The camelCase string to convert
 * @param overrides - Optional map of camelCase -> snake_case overrides that take precedence
 */
export function camelToSnake(str: string, overrides?: CasingOverrides): string {
  if (str.length === 0) return str;

  // Check overrides first
  if (overrides && str in overrides) {
    return overrides[str]!;
  }

  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Convert a snake_case string to camelCase.
 *
 * - "first_name" -> "firstName"
 * - "created_at_timestamp" -> "createdAtTimestamp"
 *
 * @param str - The snake_case string to convert
 * @param overrides - Optional map of camelCase -> snake_case overrides (reverse lookup)
 */
export function snakeToCamel(str: string, overrides?: CasingOverrides): string {
  if (str.length === 0) return str;

  // Check reverse overrides first (find camelCase key where value matches str)
  if (overrides) {
    for (const [camelKey, snakeVal] of Object.entries(overrides)) {
      if (snakeVal === str) {
        return camelKey;
      }
    }
  }

  return str.replace(
    /([a-zA-Z\d])_([a-zA-Z])/g,
    (_, prev: string, char: string) => prev + char.toUpperCase(),
  );
}
