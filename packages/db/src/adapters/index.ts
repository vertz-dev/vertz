/**
 * Database Provider Factory for @vertz/db
 *
 * Unified factory to create database providers for different dialects.
 * Supports SQLite (local) and D1 (Cloudflare Workers).
 */

import type { ColumnRecord } from '../schema/table';
import type { TableDef } from '../schema/table';
import { createSqliteAdapter } from './sqlite-adapter';
import type { SqliteAdapterOptions } from './sqlite-adapter';
import { createD1Adapter } from './d1-adapter';
import type { D1AdapterOptions, D1DatabaseBinding } from './d1-adapter';
import type { EntityDbAdapter } from '@vertz/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DbDialect = 'sqlite' | 'd1';

export interface CreateDbProviderOptions<T extends ColumnRecord> {
  /** Database dialect to use */
  dialect: DbDialect;
  /** The table schema definition */
  schema: TableDef<T>;
  /** SQLite-specific options */
  sqlite?: SqliteAdapterConfig;
  /** D1-specific options */
  d1?: {
    /** D1 database binding from Cloudflare env */
    binding: D1DatabaseBinding;
  };
  /** Migration options */
  migrations?: {
    /** Whether to auto-apply migrations on startup */
    autoApply?: boolean;
  };
}

export interface SqliteAdapterConfig {
  /** Path to the SQLite database file */
  dbPath?: string;
  /** Directory to store the database file */
  dataDir?: string;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a database provider for the specified dialect.
 * 
 * @example
 * // SQLite (local development)
 * const db = createDbProvider({
 *   dialect: 'sqlite',
 *   schema: todosTable,
 *   migrations: { autoApply: true },
 * });
 * 
 * @example
 * // D1 (Cloudflare Workers)
 * const db = createDbProvider({
 *   dialect: 'd1',
 *   schema: todosTable,
 *   d1: { binding: env.DB },
 *   migrations: { autoApply: false }, // migrations should run via wrangler
 * });
 */
export function createDbProvider<T extends ColumnRecord>(
  options: CreateDbProviderOptions<T>
): EntityDbAdapter {
  const { dialect, schema, migrations } = options;

  switch (dialect) {
    case 'sqlite':
      return createSqliteAdapter({
        schema,
        dbPath: options.sqlite?.dbPath,
        dataDir: options.sqlite?.dataDir,
        migrations,
      });

    case 'd1':
      if (!options.d1?.binding) {
        throw new Error('D1 binding is required for dialect "d1"');
      }
      return createD1Adapter({
        schema,
        d1: options.d1.binding,
        migrations,
      });

    default:
      throw new Error(`Unsupported dialect: ${dialect}`);
  }
}

// Re-export types and functions from sub-modules
export { createSqliteAdapter, createSqliteDriver } from './sqlite-adapter';
export { createD1Adapter, createD1Driver } from './d1-adapter';

// Export types
export type { SqliteAdapterOptions } from './sqlite-adapter';
export type { D1AdapterOptions, D1DatabaseBinding, D1PreparedStatement } from './d1-adapter';
