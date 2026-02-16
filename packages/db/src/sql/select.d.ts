/**
 * SELECT statement builder.
 *
 * Generates parameterized SELECT queries with support for:
 * - Column selection with camelCase -> snake_case conversion and aliasing
 * - WHERE clause via the where builder
 * - ORDER BY with direction
 * - LIMIT / OFFSET pagination (parameterized)
 * - Cursor-based pagination (cursor + take)
 * - COUNT(*) OVER() for listAndCount
 */
export interface SelectOptions {
  readonly table: string;
  readonly columns?: readonly string[];
  readonly where?: Record<string, unknown>;
  readonly orderBy?: Record<string, 'asc' | 'desc'>;
  readonly limit?: number;
  readonly offset?: number;
  readonly withCount?: boolean;
  /** Cursor object: column-value pairs marking the position to paginate from. */
  readonly cursor?: Record<string, unknown>;
  /** Number of rows to take (used with cursor). Aliases `limit` when cursor is present. */
  readonly take?: number;
}
export interface SelectResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}
/**
 * Build a SELECT statement from the given options.
 */
export declare function buildSelect(options: SelectOptions): SelectResult;
//# sourceMappingURL=select.d.ts.map
