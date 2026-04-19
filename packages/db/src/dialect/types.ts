/**
 * Dialect abstraction for SQL syntax differences.
 *
 * Dialects provide:
 * - Parameter placeholder formatting ($1 vs ?)
 * - SQL function mapping (NOW() vs datetime('now'))
 * - Column type mapping (uuid → UUID vs TEXT)
 * - Feature flags (RETURNING, array ops, JSONB path)
 */

export type { IdStrategy } from '../id/generators';

/**
 * The set of dialects Vertz supports at the type level.
 *
 * Discriminated-union narrowing on this literal at `createDb` call sites is
 * how downstream types (notably `FilterType`) gate dialect-specific filter
 * operators.
 */
export type DialectName = 'postgres' | 'sqlite';

export interface Dialect {
  /** Dialect name. */
  readonly name: DialectName;

  /**
   * Parameter placeholder: $1, $2 (postgres) or ? (sqlite).
   * @param index - 1-based parameter index
   */
  param(index: number): string;

  /** SQL function for current timestamp. */
  now(): string;

  /**
   * Map a vertz column sqlType to the dialect's SQL type.
   * @param sqlType - The generic sqlType from column metadata
   * @param meta - Additional metadata (enum values, length, precision)
   */
  mapColumnType(sqlType: string, meta?: ColumnTypeMeta): string;

  /** Whether the dialect supports RETURNING clause. */
  readonly supportsReturning: boolean;

  /** Whether the dialect supports array operators (@>, <@, &&). */
  readonly supportsArrayOps: boolean;

  /** Whether the dialect supports JSONB path operators (->>, ->). */
  readonly supportsJsonbPath: boolean;
}

export interface ColumnTypeMeta {
  readonly enumName?: string;
  readonly enumValues?: readonly string[];
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly dimensions?: number;
}
