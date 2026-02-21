import { describe, expect, it } from 'vitest';
import { PostgresDialect, defaultPostgresDialect } from '../postgres';

describe('PostgresDialect', () => {
  const dialect = new PostgresDialect();

  it('has name "postgres"', () => {
    expect(dialect.name).toBe('postgres');
  });

  it('param(1) returns $1', () => {
    expect(dialect.param(1)).toBe('$1');
  });

  it('param(5) returns $5', () => {
    expect(dialect.param(5)).toBe('$5');
  });

  it('now() returns NOW()', () => {
    expect(dialect.now()).toBe('NOW()');
  });

  it('supportsReturning is true', () => {
    expect(dialect.supportsReturning).toBe(true);
  });

  it('supportsArrayOps is true', () => {
    expect(dialect.supportsArrayOps).toBe(true);
  });

  it('supportsJsonbPath is true', () => {
    expect(dialect.supportsJsonbPath).toBe(true);
  });

  it('mapColumnType: uuid -> UUID', () => {
    expect(dialect.mapColumnType('uuid')).toBe('UUID');
  });

  it('mapColumnType: text -> TEXT', () => {
    expect(dialect.mapColumnType('text')).toBe('TEXT');
  });

  it('mapColumnType: integer -> INTEGER', () => {
    expect(dialect.mapColumnType('integer')).toBe('INTEGER');
  });

  it('mapColumnType: serial -> SERIAL', () => {
    expect(dialect.mapColumnType('serial')).toBe('SERIAL');
  });

  it('mapColumnType: boolean -> BOOLEAN', () => {
    expect(dialect.mapColumnType('boolean')).toBe('BOOLEAN');
  });

  it('mapColumnType: timestamp -> TIMESTAMPTZ', () => {
    expect(dialect.mapColumnType('timestamp')).toBe('TIMESTAMPTZ');
  });

  it('mapColumnType: float -> DOUBLE PRECISION', () => {
    expect(dialect.mapColumnType('float')).toBe('DOUBLE PRECISION');
  });

  it('mapColumnType: json -> JSONB', () => {
    expect(dialect.mapColumnType('json')).toBe('JSONB');
  });

  it('mapColumnType: decimal with precision -> NUMERIC(10,2)', () => {
    expect(dialect.mapColumnType('decimal', { precision: 10, scale: 2 })).toBe('NUMERIC(10,2)');
  });

  it('mapColumnType: decimal without precision -> NUMERIC', () => {
    expect(dialect.mapColumnType('decimal')).toBe('NUMERIC');
  });

  it('mapColumnType: varchar with length -> VARCHAR(255)', () => {
    expect(dialect.mapColumnType('varchar', { length: 255 })).toBe('VARCHAR(255)');
  });

  it('mapColumnType: varchar without length -> VARCHAR', () => {
    expect(dialect.mapColumnType('varchar')).toBe('VARCHAR');
  });

  it('mapColumnType: enum with name -> enumName', () => {
    expect(dialect.mapColumnType('enum', { enumName: 'user_role' })).toBe('user_role');
  });

  it('mapColumnType: enum without name -> TEXT', () => {
    expect(dialect.mapColumnType('enum')).toBe('TEXT');
  });

  it('mapColumnType: unknown type -> TEXT', () => {
    expect(dialect.mapColumnType('unknown')).toBe('TEXT');
  });

  it('defaultPostgresDialect is an instance', () => {
    expect(defaultPostgresDialect).toBeInstanceOf(PostgresDialect);
  });
});
