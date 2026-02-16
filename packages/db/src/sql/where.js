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
import { camelToSnake } from './casing';

const OPERATOR_KEYS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'isNull',
  'arrayContains',
  'arrayContainedBy',
  'arrayOverlaps',
]);
function isOperatorObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => OPERATOR_KEYS.has(k));
}
/**
 * Escape single quotes in a string by doubling them (SQL standard).
 */
function escapeSingleQuotes(str) {
  return str.replace(/'/g, "''");
}
/**
 * Escape LIKE metacharacters (%, _, \) in user-provided values.
 *
 * Backslash is escaped first to avoid double-escaping.
 */
function escapeLikeValue(str) {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
/**
 * Resolve a column reference that may contain JSONB path syntax.
 *
 * "metadata->role" becomes `"metadata"->>'role'`
 * "metadata->settings->theme" becomes `"metadata"->'settings'->>'theme'`
 *
 * Regular columns are just quoted with double quotes.
 * Single quotes in JSONB path segments are escaped to prevent SQL injection.
 */
function resolveColumnRef(key) {
  if (key.includes('->')) {
    const parts = key.split('->');
    const baseCol = parts[0] ?? key;
    const column = `"${camelToSnake(baseCol)}"`;
    const jsonPath = parts.slice(1);
    if (jsonPath.length === 1) {
      return `${column}->>'${escapeSingleQuotes(jsonPath[0] ?? '')}'`;
    }
    // Intermediate keys use ->, final key uses ->>
    const intermediate = jsonPath
      .slice(0, -1)
      .map((p) => `->'${escapeSingleQuotes(p)}'`)
      .join('');
    const lastKey = jsonPath[jsonPath.length - 1] ?? '';
    const final = `->>'${escapeSingleQuotes(lastKey)}'`;
    return `${column}${intermediate}${final}`;
  }
  return `"${camelToSnake(key)}"`;
}
function buildOperatorCondition(columnRef, operators, paramIndex) {
  const clauses = [];
  const params = [];
  let idx = paramIndex;
  if (operators.eq !== undefined) {
    clauses.push(`${columnRef} = $${idx + 1}`);
    params.push(operators.eq);
    idx++;
  }
  if (operators.ne !== undefined) {
    clauses.push(`${columnRef} != $${idx + 1}`);
    params.push(operators.ne);
    idx++;
  }
  if (operators.gt !== undefined) {
    clauses.push(`${columnRef} > $${idx + 1}`);
    params.push(operators.gt);
    idx++;
  }
  if (operators.gte !== undefined) {
    clauses.push(`${columnRef} >= $${idx + 1}`);
    params.push(operators.gte);
    idx++;
  }
  if (operators.lt !== undefined) {
    clauses.push(`${columnRef} < $${idx + 1}`);
    params.push(operators.lt);
    idx++;
  }
  if (operators.lte !== undefined) {
    clauses.push(`${columnRef} <= $${idx + 1}`);
    params.push(operators.lte);
    idx++;
  }
  if (operators.contains !== undefined) {
    clauses.push(`${columnRef} LIKE $${idx + 1}`);
    params.push(`%${escapeLikeValue(operators.contains)}%`);
    idx++;
  }
  if (operators.startsWith !== undefined) {
    clauses.push(`${columnRef} LIKE $${idx + 1}`);
    params.push(`${escapeLikeValue(operators.startsWith)}%`);
    idx++;
  }
  if (operators.endsWith !== undefined) {
    clauses.push(`${columnRef} LIKE $${idx + 1}`);
    params.push(`%${escapeLikeValue(operators.endsWith)}`);
    idx++;
  }
  if (operators.in !== undefined) {
    if (operators.in.length === 0) {
      // Empty IN is always false — no row can match an empty set
      clauses.push('FALSE');
    } else {
      const placeholders = operators.in.map((_, i) => `$${idx + 1 + i}`).join(', ');
      clauses.push(`${columnRef} IN (${placeholders})`);
      params.push(...operators.in);
      idx += operators.in.length;
    }
  }
  if (operators.notIn !== undefined) {
    if (operators.notIn.length === 0) {
      // Empty NOT IN is always true — every row is not in an empty set
      clauses.push('TRUE');
    } else {
      const placeholders = operators.notIn.map((_, i) => `$${idx + 1 + i}`).join(', ');
      clauses.push(`${columnRef} NOT IN (${placeholders})`);
      params.push(...operators.notIn);
      idx += operators.notIn.length;
    }
  }
  if (operators.isNull !== undefined) {
    clauses.push(`${columnRef} ${operators.isNull ? 'IS NULL' : 'IS NOT NULL'}`);
  }
  if (operators.arrayContains !== undefined) {
    clauses.push(`${columnRef} @> $${idx + 1}`);
    params.push(operators.arrayContains);
    idx++;
  }
  if (operators.arrayContainedBy !== undefined) {
    clauses.push(`${columnRef} <@ $${idx + 1}`);
    params.push(operators.arrayContainedBy);
    idx++;
  }
  if (operators.arrayOverlaps !== undefined) {
    clauses.push(`${columnRef} && $${idx + 1}`);
    params.push(operators.arrayOverlaps);
    idx++;
  }
  return { clauses, params, nextIndex: idx };
}
function buildFilterClauses(filter, paramOffset) {
  const clauses = [];
  const allParams = [];
  let idx = paramOffset;
  for (const [key, value] of Object.entries(filter)) {
    if (key === 'OR' || key === 'AND' || key === 'NOT') {
      continue;
    }
    const columnRef = resolveColumnRef(key);
    if (isOperatorObject(value)) {
      const result = buildOperatorCondition(columnRef, value, idx);
      clauses.push(...result.clauses);
      allParams.push(...result.params);
      idx = result.nextIndex;
    } else {
      // Direct value -> shorthand for { eq: value }
      clauses.push(`${columnRef} = $${idx + 1}`);
      allParams.push(value);
      idx++;
    }
  }
  // Handle OR
  if (filter.OR !== undefined) {
    if (filter.OR.length === 0) {
      // Empty OR is FALSE — disjunction over zero terms is the identity element (false)
      clauses.push('FALSE');
    } else {
      const orClauses = [];
      for (const subFilter of filter.OR) {
        const sub = buildFilterClauses(subFilter, idx);
        const joined = sub.clauses.join(' AND ');
        orClauses.push(sub.clauses.length > 1 ? `(${joined})` : joined);
        allParams.push(...sub.params);
        idx = sub.nextIndex;
      }
      clauses.push(`(${orClauses.join(' OR ')})`);
    }
  }
  // Handle AND
  if (filter.AND !== undefined) {
    if (filter.AND.length === 0) {
      // Empty AND is TRUE — conjunction over zero terms is the identity element (true)
      clauses.push('TRUE');
    } else {
      const andClauses = [];
      for (const subFilter of filter.AND) {
        const sub = buildFilterClauses(subFilter, idx);
        const joined = sub.clauses.join(' AND ');
        andClauses.push(sub.clauses.length > 1 ? `(${joined})` : joined);
        allParams.push(...sub.params);
        idx = sub.nextIndex;
      }
      clauses.push(`(${andClauses.join(' AND ')})`);
    }
  }
  // Handle NOT
  if (filter.NOT !== undefined) {
    const sub = buildFilterClauses(filter.NOT, idx);
    clauses.push(`NOT (${sub.clauses.join(' AND ')})`);
    allParams.push(...sub.params);
    idx = sub.nextIndex;
  }
  return { clauses, params: allParams, nextIndex: idx };
}
/**
 * Build a WHERE clause from a filter object.
 *
 * @param filter - The filter object with column conditions
 * @param paramOffset - Starting parameter offset (0-based, params start at $offset+1)
 * @returns WhereResult with the SQL string (without WHERE keyword) and parameter values
 */
export function buildWhere(filter, paramOffset = 0) {
  if (!filter || Object.keys(filter).length === 0) {
    return { sql: '', params: [] };
  }
  const { clauses, params } = buildFilterClauses(filter, paramOffset);
  return {
    sql: clauses.join(' AND '),
    params,
  };
}
//# sourceMappingURL=where.js.map
