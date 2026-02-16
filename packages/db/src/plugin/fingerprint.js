import { createHash } from 'node:crypto';
/**
 * Produce a deterministic fingerprint for a query shape.
 *
 * Same shape (table + operation + where keys + select keys + include keys)
 * always yields the same fingerprint, regardless of parameter values.
 */
export function fingerprint(query) {
  const parts = [
    query.table,
    query.operation,
    `w:${sortedKeys(query.where)}`,
    `s:${sortedKeys(query.select)}`,
    `i:${sortedKeys(query.include)}`,
  ];
  const input = parts.join('|');
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
function sortedKeys(obj) {
  if (!obj) return '';
  return Object.keys(obj).sort().join(',');
}
//# sourceMappingURL=fingerprint.js.map
