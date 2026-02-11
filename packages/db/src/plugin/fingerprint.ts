import { createHash } from 'node:crypto';

/**
 * The shape of a query for fingerprinting.
 * Only the structural keys matter — not the parameter values.
 */
export interface QueryShape {
  table: string;
  operation: string;
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

/**
 * Produce a deterministic fingerprint for a query shape.
 *
 * Same shape (table + operation + where keys + select keys + include keys)
 * always yields the same fingerprint, regardless of parameter values.
 */
export function fingerprint(query: QueryShape): string {
  const parts: string[] = [
    query.table,
    query.operation,
    `w:${sortedKeys(query.where)}`,
    `s:${sortedKeys(query.select)}`,
    `i:${sortedKeys(query.include)}`,
  ];

  const input = parts.join('|');
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function sortedKeys(obj?: Record<string, unknown>): string {
  if (!obj) return '';
  return Object.keys(obj).sort().join(',');
}
