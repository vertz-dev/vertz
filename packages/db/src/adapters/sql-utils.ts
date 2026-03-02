/**
 * Shared SQL generation utilities for database adapters.
 * Used by both D1 and SQLite adapters to avoid code duplication.
 */

/**
 * SECURITY NOTE: Table names, column names, and index names are interpolated
 * directly into SQL strings. This is safe because these values come exclusively
 * from developer-defined schema definitions (e.g. defineTable/defineColumn),
 * NOT from user input. If schema definitions ever accept untrusted input,
 * identifier escaping must be added.
 */

import type { DbDriver } from '../client/driver';
import { generateId } from '../id/generators';
import type { ColumnMetadata } from '../schema/column';
import type { ColumnRecord, TableDef } from '../schema/table';
import type { EntityDbAdapter, ListOptions } from '../types/adapter';

// ---------------------------------------------------------------------------
// SQL Type Generation
// ---------------------------------------------------------------------------

/**
 * Get SQLite/D1 type string from column metadata.
 * Both D1 and SQLite use SQLite under the hood, so they share the same type mapping.
 */
export function getSqlType(meta: ColumnMetadata): string {
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
      return meta.precision && meta.scale ? `DECIMAL(${meta.precision},${meta.scale})` : 'REAL';
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
 * Generate CREATE TABLE SQL from a TableDef schema.
 *
 * SECURITY: Table/column names come from schema definition, not user input.
 */
export function generateCreateTableSql<T extends ColumnRecord>(schema: TableDef<T>): string {
  const columns: string[] = [];
  const tableName = schema._name;

  for (const [colName, colBuilder] of Object.entries(schema._columns)) {
    const meta = colBuilder._meta as ColumnMetadata;
    let colDef = `${colName} ${getSqlType(meta)}`;

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
 * Generate CREATE INDEX SQL for table indexes.
 *
 * SECURITY: Index/table names come from schema definition, not user input.
 */
export function generateIndexSql<T extends ColumnRecord>(schema: TableDef<T>): string[] {
  const sqls: string[] = [];
  const tableName = schema._name;

  for (const index of schema._indexes) {
    const indexName = index.name || `idx_${tableName}_${index.columns.join('_')}`;
    const unique = index.unique ? 'UNIQUE ' : '';
    sqls.push(
      `CREATE ${unique}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${index.columns.join(', ')})`,
    );
  }

  // Add default indexes based on column types
  for (const [colName, colBuilder] of Object.entries(schema._columns)) {
    const meta = colBuilder._meta as ColumnMetadata;
    if (meta.primary || meta.unique) continue;

    // Add index on boolean columns for filtering
    if (meta.sqlType === 'boolean') {
      sqls.push(
        `CREATE INDEX IF NOT EXISTS idx_${tableName}_${colName} ON ${tableName}(${colName})`,
      );
    }
  }

  return sqls;
}

// ---------------------------------------------------------------------------
// Value Conversion Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a value for use in SQL parameters based on column type.
 * Handles boolean-to-integer conversion for SQLite/D1 backends.
 */
export function convertValueForSql(value: unknown, sqlType?: string): unknown {
  if (sqlType === 'boolean') {
    return value ? 1 : 0;
  }
  return value;
}

/**
 * Build WHERE clause parts from a where object, with boolean conversion.
 * Returns both the clause strings and the converted params.
 */
export function buildWhereClause<T extends ColumnRecord>(
  where: Record<string, unknown>,
  columns: TableDef<T>['_columns'],
): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(where)) {
    clauses.push(`${key} = ?`);
    const colMeta = columns[key]?._meta as ColumnMetadata | undefined;
    const convertedValue = convertValueForSql(value, colMeta?.sqlType);
    params.push(convertedValue);
  }

  return { clauses, params };
}

// ---------------------------------------------------------------------------
// Base Adapter Class (shared logic)
// ---------------------------------------------------------------------------

/**
 * Shared adapter base class with common functionality.
 * Both D1Adapter and SqliteAdapter extend this.
 */
export abstract class BaseSqlAdapter<T extends ColumnRecord> implements EntityDbAdapter {
  protected readonly driver: DbDriver;
  protected readonly schema: TableDef<T>;
  protected readonly tableName: string;

  constructor(driver: DbDriver, schema: TableDef<T>) {
    this.driver = driver;
    this.schema = schema;
    this.tableName = schema._name;
  }

  /**
   * Get allowed columns for WHERE clauses (whitelist for SQL injection prevention).
   */
  protected getAllowedWhereColumns(): Set<string> {
    const columns = new Set<string>();
    for (const colName of Object.keys(this.schema._columns)) {
      columns.add(colName);
    }
    return columns;
  }

  /**
   * Convert database row to proper types based on schema.
   */
  protected convertRow(row: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = { ...row };

    for (const [colName, colBuilder] of Object.entries(this.schema._columns)) {
      const meta = colBuilder._meta as ColumnMetadata;
      if (meta.sqlType === 'boolean' && row[colName] !== undefined) {
        converted[colName] = Boolean(row[colName]);
      }
    }

    return converted;
  }

  /**
   * Convert a value for insertion/update based on column type.
   */
  protected convertValueForColumn(value: unknown, colName: string): unknown {
    const colBuilder = this.schema._columns[colName];
    if (!colBuilder) return value;
    const meta = colBuilder._meta as ColumnMetadata;
    return convertValueForSql(value, meta?.sqlType);
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    try {
      const rows = await this.driver.query<Record<string, unknown>>(
        `SELECT * FROM ${this.tableName} WHERE id = ?`,
        [id],
      );
      if (!rows[0]) return null;
      return this.convertRow(rows[0]);
    } catch {
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
        const { clauses, params } = buildWhereClause(options.where, this.schema._columns);
        countSql += ` WHERE ${clauses.join(' AND ')}`;
        countParams.push(...params);
      }

      const countResult = await this.driver.query<{ count: number }>(countSql, countParams);
      const total = Number(countResult[0]?.count ?? 0);

      // Build main query
      let sql = `SELECT * FROM ${this.tableName}`;
      const params: unknown[] = [];

      if (options?.where && Object.keys(options.where).length > 0) {
        const { clauses, params: whereParams } = buildWhereClause(
          options.where,
          this.schema._columns,
        );
        sql += ` WHERE ${clauses.join(' AND ')}`;
        params.push(...whereParams);
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

        // Skip read-only columns (they're auto-generated) — except autoUpdate
        // columns which need an initial value in the INSERT
        if (meta.isReadOnly && !meta.isAutoUpdate) continue;

        // Generate ID if primary key and not provided
        if (meta.primary && !data[colName] && meta.generate) {
          data[colName] = generateId(meta.generate);
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

          // Convert boolean to integer for SQLite/D1
          value = this.convertValueForColumn(value, colName);

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
    } catch {
      throw new Error(`Failed to create record: please check your input`);
    }
  }

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const updates: string[] = [];
      const params: unknown[] = [];

      for (const [colName, colBuilder] of Object.entries(this.schema._columns)) {
        const meta = colBuilder._meta as ColumnMetadata;

        // Skip read-only columns (except autoUpdate) and primary columns
        if ((meta.isReadOnly && !meta.isAutoUpdate) || meta.primary) continue;

        // Handle auto-update columns
        if (meta.isAutoUpdate) {
          updates.push(`${colName} = ?`);
          params.push(new Date().toISOString());
        }

        if (data[colName] !== undefined) {
          updates.push(`${colName} = ?`);
          const value = this.convertValueForColumn(data[colName], colName);
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
    } catch {
      throw new Error(`Failed to delete record: please try again later`);
    }
  }
}
