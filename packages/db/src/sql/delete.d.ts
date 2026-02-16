/**
 * DELETE statement builder.
 *
 * Generates parameterized DELETE queries with support for:
 * - WHERE clause via the where builder
 * - RETURNING clause with column aliasing
 * - camelCase -> snake_case column conversion
 */
export interface DeleteOptions {
  readonly table: string;
  readonly where?: Record<string, unknown>;
  readonly returning?: '*' | readonly string[];
}
export interface DeleteResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}
/**
 * Build a DELETE statement from the given options.
 */
export declare function buildDelete(options: DeleteOptions): DeleteResult;
//# sourceMappingURL=delete.d.ts.map
