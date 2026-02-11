/**
 * Casing conversion utilities for camelCase <-> snake_case.
 *
 * Used by SQL builders to convert JavaScript property names (camelCase)
 * to PostgreSQL column names (snake_case) and vice versa.
 */

/**
 * Convert a camelCase string to snake_case.
 *
 * Handles acronyms correctly:
 * - "parseJSON" -> "parse_json"
 * - "getHTTPSUrl" -> "get_https_url"
 * - "htmlParser" -> "html_parser"
 */
export function camelToSnake(str: string): string {
  if (str.length === 0) return str;

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
 */
export function snakeToCamel(str: string): string {
  if (str.length === 0) return str;

  return str.replace(
    /([a-zA-Z\d])_([a-zA-Z])/g,
    (_, prev: string, char: string) => prev + char.toUpperCase(),
  );
}
