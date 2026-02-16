/**
 * Aggregation queries — DB-012.
 *
 * Implements count, aggregate, and groupBy methods.
 * Generates parameterized SQL for aggregation functions.
 */
import { camelToSnake } from '../sql/casing';
import { buildWhere } from '../sql/where';
import { executeQuery } from './executor';
/**
 * Count rows matching an optional filter.
 */
export async function count(queryFn, table, options) {
  const allParams = [];
  let sql = `SELECT COUNT(*) AS "count" FROM "${table._name}"`;
  if (options?.where) {
    const whereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }
  const res = await executeQuery(queryFn, sql, allParams);
  const row = res.rows[0];
  return Number(row?.count ?? 0);
}
/**
 * Run aggregation functions on a table.
 */
export async function aggregate(queryFn, table, options) {
  const selectParts = [];
  const aggFunctions = [];
  if (options._count !== undefined) {
    if (options._count === true) {
      selectParts.push('COUNT(*) AS "_count"');
      aggFunctions.push({ fn: 'count', columns: null, key: '_count' });
    } else {
      for (const col of Object.keys(options._count)) {
        const snakeCol = camelToSnake(col);
        selectParts.push(`COUNT("${snakeCol}") AS "_count_${snakeCol}"`);
      }
    }
  }
  for (const [fn, aggOpt] of [
    ['AVG', options._avg],
    ['SUM', options._sum],
    ['MIN', options._min],
    ['MAX', options._max],
  ]) {
    if (!aggOpt) continue;
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const alias = `_${fn.toLowerCase()}_${snakeCol}`;
      selectParts.push(`${fn}("${snakeCol}") AS "${alias}"`);
    }
  }
  if (selectParts.length === 0) {
    return {};
  }
  const allParams = [];
  let sql = `SELECT ${selectParts.join(', ')} FROM "${table._name}"`;
  if (options.where) {
    const whereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }
  const res = await executeQuery(queryFn, sql, allParams);
  const row = res.rows[0];
  if (!row) return {};
  // Restructure the flat row into nested result
  const result = {};
  if (options._count !== undefined) {
    if (options._count === true) {
      result._count = Number(row._count ?? 0);
    } else {
      const countObj = {};
      for (const col of Object.keys(options._count)) {
        const snakeCol = camelToSnake(col);
        countObj[col] = Number(row[`_count_${snakeCol}`] ?? 0);
      }
      result._count = countObj;
    }
  }
  for (const [fn, aggOpt] of [
    ['avg', options._avg],
    ['sum', options._sum],
    ['min', options._min],
    ['max', options._max],
  ]) {
    if (!aggOpt) continue;
    const fnObj = {};
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const val = row[`_${fn}_${snakeCol}`];
      fnObj[col] = val === null || val === undefined ? null : Number(val);
    }
    result[`_${fn}`] = fnObj;
  }
  return result;
}
/**
 * Group rows by columns and apply aggregation functions.
 */
export async function groupBy(queryFn, table, options) {
  const selectParts = [];
  const groupCols = [];
  // Add group-by columns
  for (const col of options.by) {
    const snakeCol = camelToSnake(col);
    if (snakeCol === col) {
      selectParts.push(`"${col}"`);
    } else {
      selectParts.push(`"${snakeCol}" AS "${col}"`);
    }
    groupCols.push(`"${snakeCol}"`);
  }
  // Add aggregation columns
  if (options._count !== undefined) {
    if (options._count === true) {
      selectParts.push('COUNT(*) AS "_count"');
    } else {
      for (const col of Object.keys(options._count)) {
        const snakeCol = camelToSnake(col);
        selectParts.push(`COUNT("${snakeCol}") AS "_count_${snakeCol}"`);
      }
    }
  }
  for (const [fn, aggOpt] of [
    ['AVG', options._avg],
    ['SUM', options._sum],
    ['MIN', options._min],
    ['MAX', options._max],
  ]) {
    if (!aggOpt) continue;
    for (const col of Object.keys(aggOpt)) {
      const snakeCol = camelToSnake(col);
      const alias = `_${fn.toLowerCase()}_${snakeCol}`;
      selectParts.push(`${fn}("${snakeCol}") AS "${alias}"`);
    }
  }
  const allParams = [];
  let sql = `SELECT ${selectParts.join(', ')} FROM "${table._name}"`;
  // WHERE
  if (options.where) {
    const whereResult = buildWhere(options.where);
    if (whereResult.sql.length > 0) {
      sql += ` WHERE ${whereResult.sql}`;
      allParams.push(...whereResult.params);
    }
  }
  // GROUP BY
  sql += ` GROUP BY ${groupCols.join(', ')}`;
  // ORDER BY
  if (options.orderBy) {
    // Build the set of valid aggregation aliases from the requested fields
    const validAggAliases = new Set();
    validAggAliases.add('_count');
    if (options._count !== undefined && options._count !== true) {
      for (const col of Object.keys(options._count)) {
        validAggAliases.add(`_count_${camelToSnake(col)}`);
      }
    }
    for (const [fn, aggOpt] of [
      ['avg', options._avg],
      ['sum', options._sum],
      ['min', options._min],
      ['max', options._max],
    ]) {
      if (!aggOpt) continue;
      for (const col of Object.keys(aggOpt)) {
        validAggAliases.add(`_${fn}_${camelToSnake(col)}`);
      }
    }
    const orderClauses = [];
    for (const [col, dir] of Object.entries(options.orderBy)) {
      // Validate direction — only allow 'asc' or 'desc'
      const normalizedDir = dir.toLowerCase();
      if (normalizedDir !== 'asc' && normalizedDir !== 'desc') {
        throw new Error(`Invalid orderBy direction "${dir}". Only 'asc' or 'desc' are allowed.`);
      }
      const safeDir = normalizedDir === 'desc' ? 'DESC' : 'ASC';
      if (col === '_count') {
        orderClauses.push(`COUNT(*) ${safeDir}`);
      } else if (col.startsWith('_')) {
        // Validate that the alias matches a requested aggregation field
        if (!validAggAliases.has(col)) {
          throw new Error(
            `Invalid orderBy column "${col}". Underscore-prefixed columns must match a requested aggregation alias.`,
          );
        }
        orderClauses.push(`"${col}" ${safeDir}`);
      } else {
        orderClauses.push(`"${camelToSnake(col)}" ${safeDir}`);
      }
    }
    if (orderClauses.length > 0) {
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }
  }
  // LIMIT
  if (options.limit !== undefined) {
    allParams.push(options.limit);
    sql += ` LIMIT $${allParams.length}`;
  }
  // OFFSET
  if (options.offset !== undefined) {
    allParams.push(options.offset);
    sql += ` OFFSET $${allParams.length}`;
  }
  const res = await executeQuery(queryFn, sql, allParams);
  // Restructure each row
  return res.rows.map((row) => {
    const result = {};
    // Group-by columns
    for (const col of options.by) {
      const snakeCol = camelToSnake(col);
      result[col] = row[col] ?? row[snakeCol];
    }
    // Count
    if (options._count !== undefined) {
      if (options._count === true) {
        result._count = Number(row._count ?? 0);
      } else {
        const countObj = {};
        for (const col of Object.keys(options._count)) {
          const snakeCol = camelToSnake(col);
          countObj[col] = Number(row[`_count_${snakeCol}`] ?? 0);
        }
        result._count = countObj;
      }
    }
    // Other aggregations
    for (const [fn, aggOpt] of [
      ['avg', options._avg],
      ['sum', options._sum],
      ['min', options._min],
      ['max', options._max],
    ]) {
      if (!aggOpt) continue;
      const fnObj = {};
      for (const col of Object.keys(aggOpt)) {
        const snakeCol = camelToSnake(col);
        const val = row[`_${fn}_${snakeCol}`];
        fnObj[col] = val === null || val === undefined ? null : Number(val);
      }
      result[`_${fn}`] = fnObj;
    }
    return result;
  });
}
//# sourceMappingURL=aggregate.js.map
