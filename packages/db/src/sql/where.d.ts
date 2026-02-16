/**
 * WHERE clause builder with parameterized queries.
 *
 * Supports all filter operators from the schema layer:
 * - Comparison: eq, ne, gt, gte, lt, lte
 * - String: contains, startsWith, endsWith
 * - Set: in, notIn
 * - Null: isNull (true/false)
 * - Logical: AND, OR, NOT
 * - PostgreSQL array: arrayContains (@>), arrayContainedBy (<@), arrayOverlaps (&&)
 * - JSONB path: metadata->key syntax
 *
 * All values are parameterized ($1, $2, ...) to prevent SQL injection.
 * Column names are converted from camelCase to snake_case.
 */
export interface WhereResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}
interface WhereFilter {
  readonly [key: string]: unknown;
  readonly OR?: readonly WhereFilter[];
  readonly AND?: readonly WhereFilter[];
  readonly NOT?: WhereFilter;
}
/**
 * Build a WHERE clause from a filter object.
 *
 * @param filter - The filter object with column conditions
 * @param paramOffset - Starting parameter offset (0-based, params start at $offset+1)
 * @returns WhereResult with the SQL string (without WHERE keyword) and parameter values
 */
export declare function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset?: number,
): WhereResult;
//# sourceMappingURL=where.d.ts.map
