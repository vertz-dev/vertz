/**
 * UPDATE statement builder.
 *
 * Generates parameterized UPDATE queries with support for:
 * - SET clause from a data object
 * - WHERE clause via the where builder
 * - RETURNING clause with column aliasing
 * - camelCase -> snake_case column conversion
 * - "now" sentinel handling for timestamp defaults
 */
export interface UpdateOptions {
  readonly table: string;
  readonly data: Record<string, unknown>;
  readonly where?: Record<string, unknown>;
  readonly returning?: '*' | readonly string[];
  /** Column names (camelCase) that should use NOW() instead of a parameterized value when the value is "now". */
  readonly nowColumns?: readonly string[];
}
export interface UpdateResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}
/**
 * Build an UPDATE statement from the given options.
 */
export declare function buildUpdate(options: UpdateOptions): UpdateResult;
//# sourceMappingURL=update.d.ts.map
