/**
 * Query executor — wraps raw SQL execution with error mapping.
 *
 * Takes a query function (from the database driver) and wraps it to:
 * 1. Execute parameterized SQL
 * 2. Map PG errors to typed DbError subclasses
 * 3. Return typed QueryResult
 */
export interface ExecutorResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}
export type QueryFn = <T>(sql: string, params: readonly unknown[]) => Promise<ExecutorResult<T>>;
/**
 * Execute a SQL query, mapping PG errors to typed DbError.
 */
export declare function executeQuery<T>(
  queryFn: QueryFn,
  sql: string,
  params: readonly unknown[],
): Promise<ExecutorResult<T>>;
//# sourceMappingURL=executor.d.ts.map
