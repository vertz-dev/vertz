/**
 * SQLite database setup for entity-todo.
 *
 * Provides:
 * - Local SQLite driver (bun:sqlite)
 * - EntityDbAdapter implementation for CRUD operations
 * - Migration support (creates tables from schema)
 */

import { Database } from 'bun:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { DbDriver } from '@vertz/db';
import type { EntityDbAdapter, ListOptions } from '@vertz/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Allowed column names for WHERE clauses (whitelist to prevent SQL injection)
// ---------------------------------------------------------------------------

const ALLOWED_WHERE_COLUMNS = new Set(['id', 'title', 'completed', 'createdAt', 'updatedAt']);

// ---------------------------------------------------------------------------
// Local SQLite Driver (implements DbDriver interface)
// ---------------------------------------------------------------------------

/**
 * Create a local SQLite driver using bun:sqlite.
 * Implements the DbDriver interface from @vertz/db.
 */
export function createLocalSqliteDriver(dbPath: string): DbDriver {
  let db: Database;
  
  try {
    db = new Database(dbPath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to create SQLite database at "${dbPath}". ` +
      `Please ensure the directory exists and you have write permissions. ` +
      `Error: ${errorMessage}`
    );
  }

  // Enable WAL mode for better performance
  db.run('PRAGMA journal_mode = WAL');

  return {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();
      return rows as T[];
    },

    async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { rowsAffected: result.changes };
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Migration: Create tables from schema
// ---------------------------------------------------------------------------

/**
 * Run migrations to create the todos table.
 * Uses the schema definition from schema.ts.
 */
export function runMigrations(driver: DbDriver): void {
  // Create todos table
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
  driver.execute(createTableSql);

  // Add index on completed column for better query performance
  const createIndexSql = `CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed)`;
  driver.execute(createIndexSql);
}

// ---------------------------------------------------------------------------
// EntityDbAdapter Implementation
// ---------------------------------------------------------------------------

/**
 * SQLite EntityDbAdapter for the todos entity.
 * Implements CRUD operations using the local SQLite driver.
 */
export class SqliteEntityDbAdapter implements EntityDbAdapter {
  private readonly driver: DbDriver;
  private readonly tableName = 'todos';

  constructor(driver: DbDriver) {
    this.driver = driver;
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    try {
      const rows = await this.driver.query<Record<string, unknown>>(
        `SELECT * FROM ${this.tableName} WHERE id = ?`,
        [id],
      );
      if (!rows[0]) {
        return null;
      }
      // Convert INTEGER to boolean for completed field
      return {
        ...rows[0],
        completed: Boolean(rows[0].completed),
      };
    } catch (error) {
      throw new Error(`Failed to retrieve todo: resource may be unavailable`);
    }
  }

  async list(options?: ListOptions): Promise<{ data: Record<string, unknown>[]; total: number }> {
    try {
      // Validate WHERE columns against whitelist to prevent SQL injection
      if (options?.where) {
        for (const key of Object.keys(options.where)) {
          if (!ALLOWED_WHERE_COLUMNS.has(key)) {
            throw new Error(`Invalid filter column: ${key}`);
          }
        }
      }

      // Get total count first (without WHERE, pagination)
      let countSql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const countParams: unknown[] = [];

      // Handle WHERE clause for count
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

      // Handle WHERE clause
      if (options?.where && Object.keys(options.where).length > 0) {
        const whereClauses: string[] = [];
        for (const [key, value] of Object.entries(options.where)) {
          whereClauses.push(`${key} = ?`);
          params.push(value);
        }
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      // Handle cursor-based pagination (after)
      if (options?.after) {
        sql += params.length > 0 ? ' AND' : ' WHERE';
        sql += ' id > ?';
        params.push(options.after);
      }

      // Order by id for cursor pagination
      sql += ` ORDER BY id ASC`;

      // Handle LIMIT
      const limit = options?.limit ?? 20;
      sql += ` LIMIT ?`;
      params.push(limit);

      const data = await this.driver.query<Record<string, unknown>>(sql, params);

      // Convert INTEGER to boolean for completed field
      const convertedData = data.map((row) => ({
        ...row,
        completed: Boolean(row.completed),
      }));

      return { data: convertedData, total };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid filter column:')) {
        throw error;
      }
      throw new Error(`Failed to list todos: please try again later`);
    }
  }

  async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      // Generate UUID for the id (schema uses d.uuid().primary())
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
    } catch (error) {
      throw new Error(`Failed to create todo: please check your input`);
    }
  }

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
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

      // Fetch and return the updated record
      const result = await this.get(id);
      if (!result) {
        throw new Error(`Todo not found`);
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Todo not found') {
        throw error;
      }
      throw new Error(`Failed to update todo: please try again later`);
    }
  }

  async delete(id: string): Promise<Record<string, unknown> | null> {
    try {
      const existing = await this.get(id);
      if (!existing) {
        return null;
      }

      await this.driver.execute(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
      return existing;
    } catch (error) {
      throw new Error(`Failed to delete todo: please try again later`);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function for lazy initialization
// ---------------------------------------------------------------------------

/**
 * Create and initialize the todos database adapter.
 * This is the lazy initialization pattern - call this function explicitly
 * rather than relying on module-level side effects.
 * 
 * @param dataDir - Directory to store the SQLite database file
 * @returns The initialized EntityDbAdapter for todos
 */
export function createTodosDb(dataDir?: string): EntityDbAdapter {
  // Default to sibling 'data' directory
  const dbDir = dataDir || path.join(__dirname, '..', 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'todos.db');
  
  // Create driver and run migrations
  const dbDriver = createLocalSqliteDriver(dbPath);
  runMigrations(dbDriver);

  console.log(`📦 SQLite database initialized at: ${dbPath}`);

  // Return the adapter
  return new SqliteEntityDbAdapter(dbDriver);
}
