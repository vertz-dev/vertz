/**
 * SQLite Database Adapter for @vertz/db
 *
 * Generic adapter that takes a schema and generates SQL — no manual SQL needed.
 * Implements EntityDbAdapter interface for use with @vertz/server.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DbDriver } from '../client/driver';
import type { TableDef, ColumnRecord } from '../schema/table';
import type { ColumnMetadata } from '../schema/column';
import type { EntityDbAdapter, ListOptions } from '../types/adapter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SqliteAdapterOptions<T extends ColumnRecord> {
  /** The table schema definition */
  schema: TableDef<T>;
  /** Path to the SQLite database file */
  dbPath?: string;
  /** Directory to store the database file (alternative to dbPath) */
  dataDir?: string;
  /** Auto-apply migrations on startup */
  migrations?: {
    autoApply?: boolean;
  };
}

export interface SqliteAdapterConfig {
  /** Path to the SQLite database file */
  dbPath?: string;
  /** Directory to store the database file */
  dataDir?: string;
  /** Auto-apply migrations on startup */
  migrations?: {
    autoApply?: boolean;
  };
}

// ---------------------------------------------------------------------------
// SQL Generation from Schema
// ---------------------------------------------------------------------------

/**
 * Generate CREATE TABLE SQL from a TableDef schema.
 */
function generateCreateTableSql<T extends ColumnRecord>(schema: TableDef<T>): string {
  const columns: string[] = [];
  const tableName = schema._name;

  for (const [colName, colBuilder] of Object.entries(schema._columns)) {
    const meta = colBuilder._meta as ColumnMetadata;
    let colDef = `${colName} ${getSqliteType(meta)}`;

    if (meta.primary) {
      colDef += ' PRIMARY KEY';
      if (meta.generate === 'uuid') {
        colDef += ' DEFAULT (uuid())';
      } else if (meta.generate === 'cuid') {
        colDef += ' DEFAULT (cuid())';
      }
    }

    if (meta.unique && !meta.primary) {
      colDef += ' UNIQUE';
    }

    if (!meta.nullable && !meta.primary) {
      colDef += ' NOT NULL';
    }

    if (meta.hasDefault && meta.defaultValue !== undefined) {
      if (meta.defaultValue === 'now') {
        colDef += " DEFAULT (datetime('now'))";
      } else if (typeof meta.defaultValue === 'string') {
        colDef += ` DEFAULT '${meta.defaultValue}'`;
      } else if (typeof meta.defaultValue === 'number') {
        colDef += ` DEFAULT ${meta.defaultValue}`;
      } else if (typeof meta.defaultValue === 'boolean') {
        colDef += ` DEFAULT ${meta.defaultValue ? 1 : 0}`;
      }
    }

    if (meta.check) {
      colDef += ` CHECK (${meta.check})`;
    }

    columns.push(colDef);
  }

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(',\n  ')}\n)`;
}

/**
 * Get SQLite type string from column metadata.
 */
function getSqliteType(meta: ColumnMetadata): string {
  switch (meta.sqlType) {
    case 'serial':
      return 'INTEGER';
    case 'varchar':
      return meta.length ? `VARCHAR(${meta.length})` : 'TEXT';
    case 'text':
      return 'TEXT';
    case 'integer':
      return 'INTEGER';
    case 'bigint':
      return 'BIGINT';
    case 'decimal':
      return meta.precision && meta.scale
        ? `DECIMAL(${meta.precision},${meta.scale})`
        : 'REAL';
    case 'boolean':
      return 'INTEGER';
    case 'timestamp':
    case 'timestamptz':
      return 'TEXT';
    case 'date':
      return 'TEXT';
    case 'json':
    case 'jsonb':
      return 'TEXT';
    case 'uuid':
      return 'TEXT';
    case 'enum':
      return 'TEXT';
    default:
      return 'TEXT';
  }
}

/**
 * Generate CREATE INDEX SQL for table indexes.
 */
function generateIndexSql<T extends ColumnRecord>(schema: TableDef<T>): string[] {
  const sqls: string[] = [];
  const tableName = schema._name;

  for (const index of schema._indexes) {
    const indexName = index.name || `idx_${tableName}_${index.columns.join('_')}`;
    const unique = index.unique ? 'UNIQUE ' : '';
    sqls.push(
      `CREATE ${unique}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${index.columns.join(', ')})`
    );
  }

  // Add default indexes based on column types
  for (const [colName, colBuilder] of Object.entries(schema._columns)) {
    const meta = colBuilder._meta as ColumnMetadata;
    if (meta.primary || meta.unique) continue;
    
    // Add index on boolean columns for filtering
    if (meta.sqlType === 'boolean') {
      sqls.push(`CREATE INDEX IF NOT EXISTS idx_${tableName}_${colName} ON ${tableName}(${colName})`);
    }
  }

  return sqls;
}

// ---------------------------------------------------------------------------
// SQLite Driver Implementation
// ---------------------------------------------------------------------------

/**
 * Minimal SQLite database interface (matches bun:sqlite API surface)
 */
interface SqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number };
  };
  run(sql: string): void;
  close(): void;
}

/**
 * Create a SQLite driver using bun:sqlite.
 */
export function createSqliteDriver(dbPath: string): DbDriver {
  // Dynamic import of bun:sqlite - only available at runtime in Bun
  let db: SqliteDatabase;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite');
    db = new Database(dbPath) as SqliteDatabase;
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
// SQLite EntityDbAdapter Implementation
// ---------------------------------------------------------------------------

/**
 * SQLite EntityDbAdapter that generates SQL from schema.
 */
export class SqliteAdapter<T extends ColumnRecord> implements EntityDbAdapter {
  private readonly driver: DbDriver;
  private readonly schema: TableDef<T>;
  private readonly tableName: string;

  constructor(driver: DbDriver, schema: TableDef<T>) {
    this.driver = driver;
    this.schema = schema;
    this.tableName = schema._name;
  }

  /**
   * Get allowed columns for WHERE clauses (whitelist for SQL injection prevention).
   */
  private getAllowedWhereColumns(): Set<string> {
    const columns = new Set<string>();
    for (const colName of Object.keys(this.schema._columns)) {
      columns.add(colName);
    }
    return columns;
  }

  /**
   * Convert database row to proper types based on schema.
   */
  private convertRow(row: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = { ...row };

    for (const [colName, colBuilder] of Object.entries(this.schema._columns)) {
      const meta = colBuilder._meta as ColumnMetadata;
      if (meta.sqlType === 'boolean' && row[colName] !== undefined) {
        converted[colName] = Boolean(row[colName]);
      }
    }

    return converted;
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    try {
      const rows = await this.driver.query<Record<string, unknown>>(
        `SELECT * FROM ${this.tableName} WHERE id = ?`,
        [id],
      );
      if (!rows[0]) return null;
      return this.convertRow(rows[0]);
    } catch (error) {
      throw new Error(`Failed to retrieve record: resource may be unavailable`);
    }
  }

  async list(options?: ListOptions): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const allowedColumns = this.getAllowedWhereColumns();

    try {
      // Validate WHERE columns against whitelist to prevent SQL injection
      if (options?.where) {
        for (const key of Object.keys(options.where)) {
          if (!allowedColumns.has(key)) {
            throw new Error(`Invalid filter column: ${key}`);
          }
        }
      }

      // Get total count
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

      sql += ' ORDER BY id ASC';

      const limit = options?.limit ?? 20;
      sql += ' LIMIT ?';
      params.push(limit);

      const data = await this.driver.query<Record<string, unknown>>(sql, params);
      const convertedData = data.map((row) => this.convertRow(row));

      return { data: convertedData, total };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid filter column:')) {
        throw error;
      }
      throw new Error(`Failed to list records: please try again later`);
    }
  }

  async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const columns: string[] = [];
      const placeholders: string[] = [];
      const params: unknown[] = [];

      for (const [colName, colBuilder] of Object.entries(this.schema._columns)) {
        const meta = colBuilder._meta as ColumnMetadata;
        
        // Skip read-only columns (they're auto-generated)
        if (meta.isReadOnly) continue;

        // Generate ID if primary key and not provided
        if (meta.primary && !data[colName]) {
          if (meta.generate === 'uuid') {
            data[colName] = crypto.randomUUID();
          } else if (meta.generate === 'cuid') {
            data[colName] = crypto.randomUUID(); // TODO: use actual cuid
          }
        }

        // Handle auto-update columns
        if (meta.isAutoUpdate) {
          data[colName] = new Date().toISOString();
        }

        // Use provided value or default
        if (data[colName] !== undefined || meta.hasDefault) {
          columns.push(colName);
          placeholders.push('?');
          
          let value = data[colName];
          if (value === undefined && meta.hasDefault) {
            if (meta.defaultValue === 'now') {
              value = new Date().toISOString();
            } else {
              value = meta.defaultValue;
            }
          }
          
          // Convert boolean to integer for SQLite
          if (meta.sqlType === 'boolean') {
            value = value ? 1 : 0;
          }
          
          params.push(value);
        }
      }

      await this.driver.execute(
        `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
        params,
      );

      // Return the created record
      const id = data.id as string;
      return this.get(id) as Promise<Record<string, unknown>>;
    } catch (error) {
      throw new Error(`Failed to create record: please check your input`);
    }
  }

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const updates: string[] = [];
      const params: unknown[] = [];

      for (const [colName, colBuilder] of Object.entries(this.schema._columns)) {
        const meta = colBuilder._meta as ColumnMetadata;
        
        // Skip read-only and primary columns
        if (meta.isReadOnly || meta.primary) continue;
        
        // Handle auto-update columns
        if (meta.isAutoUpdate) {
          updates.push(`${colName} = ?`);
          params.push(new Date().toISOString());
        }

        if (data[colName] !== undefined) {
          updates.push(`${colName} = ?`);
          let value = data[colName];
          
          // Convert boolean to integer for SQLite
          if (meta.sqlType === 'boolean') {
            value = value ? 1 : 0;
          }
          
          params.push(value);
        }
      }

      if (updates.length === 0) {
        return this.get(id) as Promise<Record<string, unknown>>;
      }

      params.push(id);

      await this.driver.execute(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`,
        params,
      );

      const result = await this.get(id);
      if (!result) {
        throw new Error('Record not found');
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Record not found') {
        throw error;
      }
      throw new Error(`Failed to update record: please try again later`);
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
      throw new Error(`Failed to delete record: please try again later`);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a SQLite EntityDbAdapter from a schema.
 */
export function createSqliteAdapter<T extends ColumnRecord>(
  options: SqliteAdapterOptions<T>
): EntityDbAdapter {
  const { schema, dbPath, dataDir, migrations } = options;

  // Determine database path
  let resolvedDbPath: string;
  if (dbPath) {
    resolvedDbPath = dbPath;
  } else {
    const dir = dataDir || path.join(__dirname, '..', '..', '..', 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    resolvedDbPath = path.join(dir, `${schema._name}.db`);
  }

  // Create driver
  const driver = createSqliteDriver(resolvedDbPath);

  // Run migrations if enabled
  if (migrations?.autoApply) {
    const createTableSql = generateCreateTableSql(schema);
    driver.execute(createTableSql);

    const indexSqls = generateIndexSql(schema);
    for (const sql of indexSqls) {
      driver.execute(sql);
    }

    console.log(`📦 SQLite database initialized at: ${resolvedDbPath}`);
  }

  return new SqliteAdapter(driver, schema);
}
