import { describe, expect, it } from 'vitest';
import { d } from '../../d';

describe('column type primitives', () => {
  it('d.uuid() creates a column with sqlType uuid', () => {
    const col = d.uuid();
    expect(col._meta.sqlType).toBe('uuid');
    expect(col._meta.primary).toBe(false);
    expect(col._meta.nullable).toBe(false);
    expect(col._meta.hasDefault).toBe(false);
  });

  it('d.text() creates a column with sqlType text', () => {
    const col = d.text();
    expect(col._meta.sqlType).toBe('text');
  });

  it('d.varchar(n) creates a column with sqlType varchar and stores length', () => {
    const col = d.varchar(255);
    expect(col._meta.sqlType).toBe('varchar');
    expect(col._meta.length).toBe(255);
  });

  it('d.email() creates a text column with email format metadata', () => {
    const col = d.email();
    expect(col._meta.sqlType).toBe('text');
    expect(col._meta.format).toBe('email');
  });

  it('d.boolean() creates a column with sqlType boolean', () => {
    const col = d.boolean();
    expect(col._meta.sqlType).toBe('boolean');
  });

  it('d.integer() creates a column with sqlType integer', () => {
    const col = d.integer();
    expect(col._meta.sqlType).toBe('integer');
  });

  it('d.bigint() creates a column with sqlType bigint', () => {
    const col = d.bigint();
    expect(col._meta.sqlType).toBe('bigint');
  });

  it('d.decimal(p, s) creates a column with sqlType decimal and stores precision/scale', () => {
    const col = d.decimal(10, 2);
    expect(col._meta.sqlType).toBe('decimal');
    expect(col._meta.precision).toBe(10);
    expect(col._meta.scale).toBe(2);
  });

  it('d.real() creates a column with sqlType real', () => {
    const col = d.real();
    expect(col._meta.sqlType).toBe('real');
  });

  it('d.doublePrecision() creates a column with sqlType double precision', () => {
    const col = d.doublePrecision();
    expect(col._meta.sqlType).toBe('double precision');
  });

  it('d.serial() creates a column with sqlType serial and implicit default', () => {
    const col = d.serial();
    expect(col._meta.sqlType).toBe('serial');
    expect(col._meta.hasDefault).toBe(true);
  });

  it('d.timestamp() creates a column with sqlType timestamp with time zone', () => {
    const col = d.timestamp();
    expect(col._meta.sqlType).toBe('timestamp with time zone');
  });

  it('d.date() creates a column with sqlType date', () => {
    const col = d.date();
    expect(col._meta.sqlType).toBe('date');
  });

  it('d.time() creates a column with sqlType time', () => {
    const col = d.time();
    expect(col._meta.sqlType).toBe('time');
  });

  it('d.jsonb() creates a column with sqlType jsonb', () => {
    const col = d.jsonb();
    expect(col._meta.sqlType).toBe('jsonb');
  });

  it('d.textArray() creates a column with sqlType text[]', () => {
    const col = d.textArray();
    expect(col._meta.sqlType).toBe('text[]');
  });

  it('d.integerArray() creates a column with sqlType integer[]', () => {
    const col = d.integerArray();
    expect(col._meta.sqlType).toBe('integer[]');
  });

  it('d.enum(name, values) creates a column with enum type', () => {
    const col = d.enum('user_role', ['admin', 'editor', 'viewer']);
    expect(col._meta.sqlType).toBe('enum');
    expect(col._meta.enumName).toBe('user_role');
    expect(col._meta.enumValues).toEqual(['admin', 'editor', 'viewer']);
  });
});

describe('chainable builders', () => {
  it('.primary() sets primary to true and hasDefault to true', () => {
    const col = d.uuid().primary();
    expect(col._meta.primary).toBe(true);
    expect(col._meta.hasDefault).toBe(true);
    expect(col._meta.sqlType).toBe('uuid');
  });

  it('.unique() sets unique to true', () => {
    const col = d.text().unique();
    expect(col._meta.unique).toBe(true);
  });

  it('.nullable() sets nullable to true', () => {
    const col = d.text().nullable();
    expect(col._meta.nullable).toBe(true);
  });

  it('.default(value) sets hasDefault to true and stores default value', () => {
    const col = d.boolean().default(true);
    expect(col._meta.hasDefault).toBe(true);
    expect(col._meta.defaultValue).toBe(true);
  });

  it('.sensitive() sets sensitive to true', () => {
    const col = d.email().sensitive();
    expect(col._meta.sensitive).toBe(true);
  });

  it('.hidden() sets hidden to true', () => {
    const col = d.text().hidden();
    expect(col._meta.hidden).toBe(true);
  });

  it('.check(sql) stores the check constraint', () => {
    const col = d.integer().check('value > 0');
    expect(col._meta.check).toBe('value > 0');
  });

  it('.references(table, column) stores foreign key reference', () => {
    const col = d.uuid().references('users', 'id');
    expect(col._meta.references).toEqual({ table: 'users', column: 'id' });
  });

  it('.references(table) defaults column to id', () => {
    const col = d.uuid().references('users');
    expect(col._meta.references).toEqual({ table: 'users', column: 'id' });
  });

  it('chaining multiple builders preserves all metadata', () => {
    const col = d.text().unique().nullable().default('hello');
    expect(col._meta.unique).toBe(true);
    expect(col._meta.nullable).toBe(true);
    expect(col._meta.hasDefault).toBe(true);
    expect(col._meta.defaultValue).toBe('hello');
    expect(col._meta.sqlType).toBe('text');
  });

  it('chaining preserves sqlType through multiple builders', () => {
    const col = d.uuid().primary().unique();
    expect(col._meta.sqlType).toBe('uuid');
    expect(col._meta.primary).toBe(true);
    expect(col._meta.unique).toBe(true);
  });
});

describe('d.jsonb<T>({ validator })', () => {
  it('stores the validator in metadata when provided', () => {
    interface Settings {
      theme: string;
    }
    const validator = { parse: (v: unknown): Settings => v as Settings };
    const col = d.jsonb<Settings>({ validator });
    expect(col._meta.sqlType).toBe('jsonb');
    expect(col._meta.validator).toBe(validator);
  });

  it('works without validator', () => {
    const col = d.jsonb<{ foo: string }>();
    expect(col._meta.sqlType).toBe('jsonb');
    expect(col._meta.validator).toBeUndefined();
  });
});

describe('builder immutability', () => {
  it('chainable builders return new instances (do not mutate original)', () => {
    const original = d.text();
    const withUnique = original.unique();
    const withNullable = original.nullable();

    expect(original._meta.unique).toBe(false);
    expect(original._meta.nullable).toBe(false);
    expect(withUnique._meta.unique).toBe(true);
    expect(withUnique._meta.nullable).toBe(false);
    expect(withNullable._meta.nullable).toBe(true);
    expect(withNullable._meta.unique).toBe(false);
  });

  it('.default("now") stores the string "now" as default value', () => {
    const col = d.timestamp().default('now');
    expect(col._meta.hasDefault).toBe(true);
    expect(col._meta.defaultValue).toBe('now');
  });
});
