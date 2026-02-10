// ============================================================================
// Layer 5: Database Type with Query Methods
// ============================================================================
// The `Database` interface provides typed query methods for each table.
// Uses the FindResult type to resolve return types based on query options.
// ============================================================================

import type { TableDef } from './table.js';
import type { DatabaseSchema, FindOptions, FindResult } from './query.js';

// ============================================================================
// Database Interface
// ============================================================================

export interface Database<TSchema extends DatabaseSchema> {
  /**
   * Find multiple records from a table.
   * Return type narrows based on select, include, and visibility options.
   */
  find<
    TName extends keyof TSchema & string,
    TOpts extends FindOptions<TSchema, TSchema[TName]>,
  >(
    table: TName,
    options?: TOpts,
  ): Promise<FindResult<TSchema, TSchema[TName], TOpts extends undefined ? FindOptions<TSchema, TSchema[TName]> : TOpts>[]>;

  /**
   * Find a single record from a table.
   * Same type resolution as find(), but returns a single result or null.
   */
  findOne<
    TName extends keyof TSchema & string,
    TOpts extends FindOptions<TSchema, TSchema[TName]>,
  >(
    table: TName,
    options?: TOpts,
  ): Promise<FindResult<TSchema, TSchema[TName], TOpts extends undefined ? FindOptions<TSchema, TSchema[TName]> : TOpts> | null>;
}

// ============================================================================
// createDb -- creates a typed Database instance
// ============================================================================
// This is a TYPE-LEVEL POC. The runtime implementation is a stub.
// What matters is that the types resolve correctly.
// ============================================================================

export function createDb<TSchema extends DatabaseSchema>(
  _tables: { [K in keyof TSchema]: TSchema[K] },
): Database<TSchema> {
  // Runtime stub -- this POC is about type inference, not runtime behavior.
  return {
    find: (() => Promise.resolve([])) as any,
    findOne: (() => Promise.resolve(null)) as any,
  };
}
