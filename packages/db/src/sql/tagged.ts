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

function isSqlFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    (value as SqlFragment)._tag === 'SqlFragment'
  );
}

/**
 * Re-number parameter placeholders ($1, $2, ...) in a SQL string
 * starting from the given offset.
 */
function renumberParams(sqlStr: string, offset: number): string {
  let counter = 0;
  return sqlStr.replace(/\$(\d+)/g, () => {
    counter++;
    return `$${offset + counter}`;
  });
}

/**
 * SQL tagged template literal.
 *
 * Interpolated values are automatically parameterized as $1, $2, etc.
 * SqlFragment instances (from sql`` or sql.raw()) are composed inline
 * with their parameters renumbered to fit the parent query.
 *
 * @example
 * const result = sql`SELECT * FROM users WHERE id = ${userId}`;
 * // { _tag: 'SqlFragment', sql: 'SELECT * FROM users WHERE id = $1', params: [userId] }
 */
function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
  const sqlParts: string[] = [];
  const allParams: unknown[] = [];

  for (let i = 0; i < strings.length; i++) {
    const part = strings[i] ?? '';
    sqlParts.push(part);

    if (i < values.length) {
      const value = values[i];

      if (isSqlFragment(value)) {
        // Compose nested fragment: inline its SQL with renumbered params
        const renumbered = renumberParams(value.sql, allParams.length);
        sqlParts.push(renumbered);
        allParams.push(...value.params);
      } else {
        // Regular value: parameterize it
        allParams.push(value);
        sqlParts.push(`$${allParams.length}`);
      }
    }
  }

  return {
    _tag: 'SqlFragment',
    sql: sqlParts.join(''),
    params: allParams,
  };
}

/**
 * Insert raw SQL without parameterization.
 *
 * WARNING: Only use with trusted values (column names, table names, SQL keywords).
 * Never use with user input — this bypasses SQL injection protection.
 *
 * @example
 * const col = sql.raw('created_at');
 * const result = sql`SELECT ${col} FROM users`;
 * // { sql: 'SELECT created_at FROM users', params: [] }
 */
function rawSql(value: string): SqlFragment {
  return {
    _tag: 'SqlFragment',
    sql: value,
    params: [],
  };
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
export const sql: {
  (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment;
  raw(value: string): SqlFragment;
} = Object.assign(sqlTag, { raw: rawSql });
