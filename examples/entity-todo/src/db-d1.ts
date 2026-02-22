/**
 * D1 database adapter for entity-todo.
 *
 * Provides:
 * - D1 SQLite driver (Cloudflare D1)
 * - EntityDbAdapter implementation for CRUD operations
 * - Migration support (creates tables from schema)
 *
 * This adapter is used in the Cloudflare Worker (worker.ts).
 * For local development with bun:sqlite, see db.ts instead.
 */

import type { DbDriver } from '@vertz/db';
import type { EntityDbAdapter, ListOptions } from '@vertz/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * D1 database binding interface (matches @cloudflare/workers-types)
 */
export interface D1DatabaseBinding {
  prepare(sql: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

// ---------------------------------------------------------------------------
// D1 Driver Implementation (matches @vertz/db sqlite-driver.ts interface)
// ---------------------------------------------------------------------------

/**
 * Create a D1 database driver from the Cloudflare D1 binding.
 *
 * @param d1 - D1 database binding from env.DB
 * @returns A DbDriver implementation for D1
 */
function createD1Driver(d1: D1DatabaseBinding): DbDriver {
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
// Migration: Create tables from schema
// ---------------------------------------------------------------------------

/**
 * Run migrations to create the todos table.
 */
export function runD1Migrations(driver: DbDriver): void {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
  driver.execute(createTableSql).catch((err) => {
    console.error('Migration error:', err);
  });
}

// ---------------------------------------------------------------------------
// EntityDbAdapter Implementation for D1
// ---------------------------------------------------------------------------

/**
 * D1-based EntityDbAdapter for the todos entity.
 * Implements CRUD operations using the D1 driver.
 */
export class D1EntityDbAdapter implements EntityDbAdapter {
  private readonly driver: DbDriver;
  private readonly tableName = 'todos';

  constructor(driver: DbDriver) {
    this.driver = driver;
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.driver.query<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id],
    );
    if (!rows[0]) return null;
    
    return this.convertRow(rows[0]);
  }

  async list(options?: ListOptions): Promise<{ data: Record<string, unknown>[]; total: number }> {
    // Get total count first
    let countSql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const countParams: unknown[] = [];

    if (options?.where && Object.keys(options.where).length > 0) {
      const whereClauses: string[] = [];
      for (const [key, value] of Object.entries(options.where)) {
        whereClauses.push(`${key} = ?`);
        countParams.push(value);
      }
      countSql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countResult = await this.driver.query<{ count: number }>(countSql, countParams);
    const total = Number(countResult[0]?.count ?? 0);

    // Build main query
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: unknown[] = [];

    if (options?.where && Object.keys(options.where).length > 0) {
      const whereClauses: string[] = [];
      for (const [key, value] of Object.entries(options.where)) {
        whereClauses.push(`${key} = ?`);
        params.push(value);
      }
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (options?.after) {
      sql += params.length > 0 ? ' AND' : ' WHERE';
      sql += ' id > ?';
      params.push(options.after);
    }

    sql += ` ORDER BY id ASC`;

    const limit = options?.limit ?? 20;
    sql += ` LIMIT ?`;
    params.push(limit);

    const data = await this.driver.query<Record<string, unknown>>(sql, params);

    // Convert INTEGER to boolean for completed field
    const convertedData = data.map((row) => this.convertRow(row));

    return { data: convertedData, total };
  }

  async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = (data.id as string) || crypto.randomUUID();
    const now = new Date().toISOString();

    await this.driver.execute(
      `INSERT INTO ${this.tableName} (id, title, completed, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      [id, data.title, data.completed ? 1 : 0, now, now],
    );

    return {
      id,
      title: data.title,
      completed: Boolean(data.completed),
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      params.push(data.title);
    }
    if (data.completed !== undefined) {
      updates.push('completed = ?');
      params.push(data.completed ? 1 : 0);
    }

    updates.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    await this.driver.execute(
      `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );

    const result = await this.get(id);
    if (!result) {
      throw new Error(`Failed to update todos/${id}`);
    }
    return result;
  }

  async delete(id: string): Promise<Record<string, unknown> | null> {
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    await this.driver.execute(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    return existing;
  }

  /**
   * Convert D1 row values to proper types.
   * D1 returns INTEGER for boolean columns, we convert to JavaScript boolean.
   */
  private convertRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
      ...row,
      completed: Boolean(row.completed),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a D1-based EntityDbAdapter for the todos entity.
 *
 * @param d1 - D1 database binding from Cloudflare env
 * @returns EntityDbAdapter instance configured for D1
 */
export function createD1DbAdapter(d1: D1DatabaseBinding): EntityDbAdapter {
  const driver = createD1Driver(d1);
  
  // Run migrations synchronously (D1 tables are created on first deploy)
  // In production, migrations should be run via wrangler d1 migrations
  // This is a no-op if the table already exists
  runD1Migrations(driver);

  return new D1EntityDbAdapter(driver);
}
