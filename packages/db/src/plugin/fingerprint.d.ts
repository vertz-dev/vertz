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
export declare function fingerprint(query: QueryShape): string;
//# sourceMappingURL=fingerprint.d.ts.map
