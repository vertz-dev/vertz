/**
 * D1 Database Adapter for @vertz/db
 *
 * Generic D1 adapter that takes a schema and generates SQL — no manual SQL needed.
 * Implements EntityDbAdapter interface for use with @vertz/server (Cloudflare Workers).
 */

import type { DbDriver } from '../client/driver';
import type { ColumnRecord, TableDef } from '../schema/table';
import type { EntityDbAdapter } from '../types/adapter';
import { BaseSqlAdapter, generateCreateTableSql, generateIndexSql } from './sql-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface D1DatabaseBinding {
  prepare(sql: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1AdapterOptions<T extends ColumnRecord> {
  /** A single table schema definition. One adapter instance = one table. */
  schema: TableDef<T>;
  /** D1 database binding from Cloudflare env */
  d1: D1DatabaseBinding;
  /**
   * Whether migrations should be applied at runtime.
   * NOTE: For D1, migrations should typically be run via `wrangler d1 migrations apply`
   * during deployment, not at runtime. Set to false for production use.
   */
  migrations?: {
    autoApply?: boolean;
  };
}

// ---------------------------------------------------------------------------
// D1 Driver Implementation
// ---------------------------------------------------------------------------

/**
 * Create a DbDriver from a D1 database binding.
 */
export function createD1Driver(d1: D1DatabaseBinding): DbDriver {
  const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    const prepared = d1.prepare(sql);
    const bound = params ? prepared.bind(...params) : prepared;
    const result = await bound.all();
    return result.results as T[];
  };

  const execute = async (sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> => {
    const prepared = d1.prepare(sql);
    const bound = params ? prepared.bind(...params) : prepared;
    const result = await bound.run();
    return { rowsAffected: result.meta.changes };
  };

  return {
    query,
    execute,
    close: async () => {
      // D1 doesn't require explicit closing
    },
  };
}

// ---------------------------------------------------------------------------
// D1 EntityDbAdapter Implementation
// ---------------------------------------------------------------------------

/**
 * D1 EntityDbAdapter that generates SQL from schema.
 */
export class D1Adapter<T extends ColumnRecord> extends BaseSqlAdapter<T> {
  constructor(driver: DbDriver, schema: TableDef<T>) {
    super(driver, schema);
  }
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a D1 EntityDbAdapter for a single table schema and D1 binding.
 *
 * This adapter manages one entity (table) per instance — pass a single
 * `TableDef` as the `schema` option. For multi-table applications, use
 * `createDb()` from `@vertz/db` instead, which accepts a `models` record
 * with multiple entries.
 *
 * NOTE: For production D1 deployments, migrations should be run via
 * `wrangler d1 migrations apply` during deployment, NOT at runtime.
 * Set `migrations.autoApply = false` or omit the migrations option for production.
 */
export function createD1Adapter<T extends ColumnRecord>(
  options: D1AdapterOptions<T>,
): EntityDbAdapter {
  const { schema, d1, migrations } = options;

  // Create driver
  const driver = createD1Driver(d1);

  // Run migrations if enabled (usually should be false for D1 in production)
  if (migrations?.autoApply) {
    const createTableSql = generateCreateTableSql(schema);
    driver.execute(createTableSql);

    const indexSqls = generateIndexSql(schema);
    for (const sql of indexSqls) {
      driver.execute(sql);
    }

    console.log(`📦 D1 database adapter initialized for table: ${schema._name}`);
  }

  return new D1Adapter(driver, schema);
}
