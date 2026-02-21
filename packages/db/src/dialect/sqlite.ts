import type { ColumnTypeMeta, Dialect } from './types';

/**
 * SQLite dialect implementation.
 *
 * SQLite 3.35+ supports RETURNING clause.
 */
export class SqliteDialect implements Dialect {
  readonly name = 'sqlite' as const;
  readonly supportsReturning = true;
  readonly supportsArrayOps = false;
  readonly supportsJsonbPath = false;

  param(_index: number): string {
    return '?';
  }

  now(): string {
    return "datetime('now')";
  }

  mapColumnType(sqlType: string, _meta?: ColumnTypeMeta): string {
    switch (sqlType) {
      case 'uuid':
        return 'TEXT';
      case 'boolean':
        return 'INTEGER';
      case 'timestamp':
        return 'TEXT';
      case 'json':
      case 'jsonb':
        return 'TEXT';
      case 'decimal':
        return 'REAL';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'INTEGER';
      case 'serial':
        return 'INTEGER';
      default:
        return 'TEXT';
    }
  }
}

/** Default SQLite dialect instance. */
export const defaultSqliteDialect: SqliteDialect = new SqliteDialect();
