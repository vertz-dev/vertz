/**
 * INSERT statement builder.
 *
 * Generates parameterized INSERT queries with support for:
 * - Single row and batch (multi-row VALUES) inserts
 * - RETURNING clause with column aliasing
 * - ON CONFLICT (upsert) — DO NOTHING or DO UPDATE SET
 * - camelCase -> snake_case column conversion
 * - "now" sentinel handling for timestamp defaults
 */
export interface OnConflictOptions {
  readonly columns: readonly string[];
  readonly action: 'nothing' | 'update';
  readonly updateColumns?: readonly string[];
  /** Explicit update values for ON CONFLICT DO UPDATE SET (used by upsert). */
  readonly updateValues?: Record<string, unknown>;
}
export interface InsertOptions {
  readonly table: string;
  readonly data: Record<string, unknown> | readonly Record<string, unknown>[];
  readonly returning?: '*' | readonly string[];
  readonly onConflict?: OnConflictOptions;
  /** Column names (camelCase) that should use NOW() instead of a parameterized value when the value is "now". */
  readonly nowColumns?: readonly string[];
}
export interface InsertResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}
/**
 * Build an INSERT statement from the given options.
 */
export declare function buildInsert(options: InsertOptions): InsertResult;
//# sourceMappingURL=insert.d.ts.map
