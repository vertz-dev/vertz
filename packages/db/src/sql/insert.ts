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

import { camelToSnake } from './casing';

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
 * Build a column reference for RETURNING with optional alias.
 */
function buildReturningColumnRef(name: string): string {
  const snakeName = camelToSnake(name);
  if (snakeName === name) {
    return `"${name}"`;
  }
  return `"${snakeName}" AS "${name}"`;
}

/**
 * Build an INSERT statement from the given options.
 */
export function buildInsert(options: InsertOptions): InsertResult {
  const rows = Array.isArray(options.data) ? options.data : [options.data];
  const firstRow = rows[0];
  if (!firstRow) {
    return { sql: `INSERT INTO "${options.table}" DEFAULT VALUES`, params: [] };
  }
  const keys = Object.keys(firstRow);
  const nowSet = new Set(options.nowColumns ?? []);

  // Column names
  const columns = keys.map((k) => `"${camelToSnake(k)}"`).join(', ');

  // Build VALUES for each row
  const allParams: unknown[] = [];
  const valuesClauses: string[] = [];

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const key of keys) {
      const value = row[key];
      if (nowSet.has(key) && value === 'now') {
        placeholders.push('NOW()');
      } else {
        allParams.push(value);
        placeholders.push(`$${allParams.length}`);
      }
    }
    valuesClauses.push(`(${placeholders.join(', ')})`);
  }

  let sql = `INSERT INTO "${options.table}" (${columns}) VALUES ${valuesClauses.join(', ')}`;

  // ON CONFLICT
  if (options.onConflict) {
    const conflictCols = options.onConflict.columns.map((c) => `"${camelToSnake(c)}"`).join(', ');

    if (options.onConflict.action === 'nothing') {
      sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
    } else if (options.onConflict.action === 'update' && options.onConflict.updateColumns) {
      if (options.onConflict.updateValues) {
        // Explicit update values: parameterize each value
        const updateVals = options.onConflict.updateValues;
        const setClauses = options.onConflict.updateColumns
          .map((c) => {
            const snakeCol = camelToSnake(c);
            allParams.push(updateVals[c]);
            return `"${snakeCol}" = $${allParams.length}`;
          })
          .join(', ');
        sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClauses}`;
      } else {
        // Use EXCLUDED values (from the INSERT row)
        const setClauses = options.onConflict.updateColumns
          .map((c) => {
            const snakeCol = camelToSnake(c);
            return `"${snakeCol}" = EXCLUDED."${snakeCol}"`;
          })
          .join(', ');
        sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClauses}`;
      }
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
