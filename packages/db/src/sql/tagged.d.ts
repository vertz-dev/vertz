/**
 * SQL tagged template literal and escape hatch.
 *
 * Provides a safe, composable way to write raw SQL with automatic parameterization.
 *
 * Usage:
 *   const result = sql`SELECT * FROM users WHERE id = ${userId}`;
 *   // { sql: 'SELECT * FROM users WHERE id = $1', params: [userId] }
 *
 *   const col = sql.raw('created_at');
 *   const result = sql`SELECT ${col} FROM users`;
 *   // { sql: 'SELECT created_at FROM users', params: [] }
 *
 *   const where = sql`WHERE active = ${true}`;
 *   const query = sql`SELECT * FROM users ${where}`;
 *   // { sql: 'SELECT * FROM users WHERE active = $1', params: [true] }
 */
/**
 * A fragment of SQL with parameterized values.
 *
 * The `_tag` property is used to identify SqlFragment instances during
 * template composition, distinguishing them from regular interpolated values.
 */
export interface SqlFragment {
  readonly _tag: 'SqlFragment';
  readonly sql: string;
  readonly params: readonly unknown[];
}
/**
 * SQL tagged template with escape hatch.
 *
 * Use as a tagged template literal for automatic parameterization:
 *   sql`SELECT * FROM users WHERE id = ${userId}`
 *
 * Use sql.raw() for trusted raw SQL injection:
 *   sql.raw('column_name')
 *
 * Compose fragments by nesting sql`` inside sql``:
 *   const where = sql`WHERE active = ${true}`;
 *   const query = sql`SELECT * FROM users ${where}`;
 */
export declare const sql: {
  (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment;
  raw(value: string): SqlFragment;
};
//# sourceMappingURL=tagged.d.ts.map
