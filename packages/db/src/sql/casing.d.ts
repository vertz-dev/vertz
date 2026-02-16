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
export declare function camelToSnake(str: string): string;
/**
 * Convert a snake_case string to camelCase.
 *
 * - "first_name" -> "firstName"
 * - "created_at_timestamp" -> "createdAtTimestamp"
 */
export declare function snakeToCamel(str: string): string;
//# sourceMappingURL=casing.d.ts.map
