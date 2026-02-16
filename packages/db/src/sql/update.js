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
import { camelToSnake } from './casing';
import { buildWhere } from './where';

/**
 * Build a column reference for RETURNING with optional alias.
 */
function buildReturningColumnRef(name) {
  const snakeName = camelToSnake(name);
  if (snakeName === name) {
    return `"${name}"`;
  }
  return `"${snakeName}" AS "${name}"`;
}
/**
 * Build an UPDATE statement from the given options.
 */
export function buildUpdate(options) {
  const keys = Object.keys(options.data);
  const nowSet = new Set(options.nowColumns ?? []);
  const allParams = [];
  // SET clause
  const setClauses = [];
  for (const key of keys) {
    const snakeCol = camelToSnake(key);
    const value = options.data[key];
    if (nowSet.has(key) && value === 'now') {
      setClauses.push(`"${snakeCol}" = NOW()`);
    } else {
      allParams.push(value);
      setClauses.push(`"${snakeCol}" = $${allParams.length}`);
    }
  }
  let sql = `UPDATE "${options.table}" SET ${setClauses.join(', ')}`;
  // WHERE
  if (options.where) {
    const whereResult = buildWhere(options.where, allParams.length);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }
  // RETURNING
  if (options.returning) {
    if (options.returning === '*') {
      sql += ' RETURNING *';
    } else {
      const returnCols = options.returning.map(buildReturningColumnRef).join(', ');
      sql += ` RETURNING ${returnCols}`;
    }
  }
  return { sql, params: allParams };
}
//# sourceMappingURL=update.js.map
