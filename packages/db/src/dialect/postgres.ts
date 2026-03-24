import type { ColumnTypeMeta, Dialect } from './types';

/**
 * PostgreSQL dialect implementation.
 *
 * Extracted from existing behavior — no functional changes.
 */
export class PostgresDialect implements Dialect {
  readonly name = 'postgres' as const;
  readonly supportsReturning = true;
  readonly supportsArrayOps = true;
  readonly supportsJsonbPath = true;

  constructor() {
    // Explicit constructor for V8 coverage tracking
  }

  param(index: number): string {
    return `$${index}`;
  }

  now(): string {
    return 'NOW()';
  }

  mapColumnType(sqlType: string, meta?: ColumnTypeMeta): string {
    switch (sqlType) {
      case 'uuid':
        return 'UUID';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'serial':
        return 'SERIAL';
      case 'boolean':
        return 'BOOLEAN';
      case 'timestamp':
        return 'TIMESTAMPTZ';
      case 'float':
        return 'DOUBLE PRECISION';
      case 'json':
        return 'JSONB';
      case 'decimal':
        return meta?.precision ? `NUMERIC(${meta.precision},${meta.scale ?? 0})` : 'NUMERIC';
      case 'varchar':
        return meta?.length ? `VARCHAR(${meta.length})` : 'VARCHAR';
      case 'enum':
        return meta?.enumName ?? 'TEXT';
      default:
        return 'TEXT';
    }
  }
}

/** Default Postgres dialect instance. */
export const defaultPostgresDialect: PostgresDialect = new PostgresDialect();
