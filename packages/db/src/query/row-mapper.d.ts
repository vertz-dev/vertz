/**
 * Row mapper — converts snake_case PostgreSQL row keys to camelCase.
 *
 * Used by query builder methods to normalize result rows from PG.
 * Handles nested objects and arrays (for JSONB columns, these are
 * preserved as-is since JSONB key casing is user-defined).
 */
/**
 * Convert all top-level keys of a row from snake_case to camelCase.
 * JSONB columns (objects/arrays) are not deeply transformed — only
 * top-level column keys are mapped.
 */
export declare function mapRow<T>(row: Record<string, unknown>): T;
/**
 * Convert an array of rows from snake_case to camelCase.
 */
export declare function mapRows<T>(rows: readonly Record<string, unknown>[]): T[];
//# sourceMappingURL=row-mapper.d.ts.map
