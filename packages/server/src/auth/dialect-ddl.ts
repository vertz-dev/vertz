/**
 * Dialect-aware DDL helpers for auth table creation.
 *
 * Produces SQL column type fragments for SQLite and PostgreSQL,
 * enabling portable CREATE TABLE statements.
 */

export type DbDialectName = 'sqlite' | 'postgres';

export interface DDLHelpers {
  boolean(def: boolean): string;
  timestamp(): string;
  timestampNullable(): string;
  text(): string;
  textPrimary(): string;
  integer(): string;
}

export function dialectDDL(dialect: DbDialectName): DDLHelpers {
  return {
    boolean: (def: boolean) =>
      dialect === 'sqlite'
        ? `INTEGER NOT NULL DEFAULT ${def ? 1 : 0}`
        : `BOOLEAN NOT NULL DEFAULT ${def}`,
    timestamp: () => (dialect === 'sqlite' ? 'TEXT NOT NULL' : 'TIMESTAMPTZ NOT NULL'),
    timestampNullable: () => (dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ'),
    text: () => 'TEXT',
    textPrimary: () => 'TEXT PRIMARY KEY',
    integer: () => 'INTEGER',
  };
}
