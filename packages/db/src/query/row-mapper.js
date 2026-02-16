/**
 * Row mapper — converts snake_case PostgreSQL row keys to camelCase.
 *
 * Used by query builder methods to normalize result rows from PG.
 * Handles nested objects and arrays (for JSONB columns, these are
 * preserved as-is since JSONB key casing is user-defined).
 */
import { snakeToCamel } from '../sql/casing';
/**
 * Convert all top-level keys of a row from snake_case to camelCase.
 * JSONB columns (objects/arrays) are not deeply transformed — only
 * top-level column keys are mapped.
 */
export function mapRow(row) {
  const result = {};
  for (const key of Object.keys(row)) {
    result[snakeToCamel(key)] = row[key];
  }
  return result;
}
/**
 * Convert an array of rows from snake_case to camelCase.
 */
export function mapRows(rows) {
  return rows.map((row) => mapRow(row));
}
//# sourceMappingURL=row-mapper.js.map
