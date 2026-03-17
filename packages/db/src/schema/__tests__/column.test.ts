import { describe, expect, it } from 'bun:test';
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

  it(".is('sensitive') adds sensitive to _annotations", () => {
    const col = d.email().is('sensitive');
    expect(col._meta._annotations.sensitive).toBe(true);
  });

  it(".is('hidden') adds hidden to _annotations", () => {
    const col = d.text().is('hidden');
    expect(col._meta._annotations.hidden).toBe(true);
  });

  it('.check(sql) stores the check constraint', () => {
    const col = d.integer().check('value > 0');
    expect(col._meta.check).toBe('value > 0');
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

  it('accepts schema directly (new API)', () => {
    interface Settings {
      theme: string;
    }
    const schema = { parse: (v: unknown): Settings => v as Settings };
    const col = d.jsonb<Settings>(schema);
    expect(col._meta.sqlType).toBe('jsonb');
    expect(col._meta.validator).toBe(schema);
  });

  it('distinguishes schema from config object', () => {
    interface Settings {
      theme: string;
    }
    // Schema (has parse, no validator key)
    const schema = { parse: (v: unknown): Settings => v as Settings };
    const colWithSchema = d.jsonb<Settings>(schema);
    expect(colWithSchema._meta.validator).toBe(schema);

    // Config object (has validator key)
    const validator = { parse: (v: unknown): Settings => v as Settings };
    const colWithConfig = d.jsonb<Settings>({ validator });
    expect(colWithConfig._meta.validator).toBe(validator);
  });
});

describe('d.tenant() removed', () => {
  it('d.tenant no longer exists on the d namespace', () => {
    expect('tenant' in d).toBe(false);
  });
});

describe('string validation constraints', () => {
  it('.min(n) stores _minLength in metadata', () => {
    const col = d.text().min(3);
    expect(col._meta._minLength).toBe(3);
  });

  it('.max(n) stores _maxLength in metadata', () => {
    const col = d.text().max(100);
    expect(col._meta._maxLength).toBe(100);
  });

  it('.regex(pattern) stores _regex in metadata', () => {
    const col = d.text().regex(/^[A-Z]+$/);
    expect(col._meta._regex).toEqual(/^[A-Z]+$/);
  });

  it('chaining min, max, regex preserves all constraint metadata', () => {
    const col = d
      .text()
      .min(1)
      .max(5)
      .regex(/^[A-Z0-9]+$/i);
    expect(col._meta._minLength).toBe(1);
    expect(col._meta._maxLength).toBe(5);
    expect(col._meta._regex).toEqual(/^[A-Z0-9]+$/i);
  });

  it('constraints survive chaining with standard builders', () => {
    const col = d.text().min(1).max(10).unique().nullable();
    expect(col._meta._minLength).toBe(1);
    expect(col._meta._maxLength).toBe(10);
    expect(col._meta.unique).toBe(true);
    expect(col._meta.nullable).toBe(true);
  });

  it('d.varchar() supports .min()', () => {
    const col = d.varchar(255).min(1);
    expect(col._meta._minLength).toBe(1);
    expect(col._meta.length).toBe(255);
  });

  it('d.email() supports .min() and .max()', () => {
    const col = d.email().min(5).max(255);
    expect(col._meta._minLength).toBe(5);
    expect(col._meta._maxLength).toBe(255);
    expect(col._meta.format).toBe('email');
  });

  it('constraint builders are immutable (do not mutate original)', () => {
    const original = d.text();
    const withMin = original.min(3);
    expect(original._meta._minLength).toBeUndefined();
    expect(withMin._meta._minLength).toBe(3);
  });
});

describe('numeric validation constraints', () => {
  it('.min(n) stores _minValue in metadata', () => {
    const col = d.integer().min(0);
    expect(col._meta._minValue).toBe(0);
  });

  it('.max(n) stores _maxValue in metadata', () => {
    const col = d.integer().max(100);
    expect(col._meta._maxValue).toBe(100);
  });

  it('chaining min and max preserves both', () => {
    const col = d.integer().min(0).max(100);
    expect(col._meta._minValue).toBe(0);
    expect(col._meta._maxValue).toBe(100);
  });

  it('d.real() supports .min() and .max()', () => {
    const col = d.real().min(0).max(5);
    expect(col._meta._minValue).toBe(0);
    expect(col._meta._maxValue).toBe(5);
  });

  it('d.doublePrecision() supports .min() and .max()', () => {
    const col = d.doublePrecision().min(-1).max(1);
    expect(col._meta._minValue).toBe(-1);
    expect(col._meta._maxValue).toBe(1);
  });

  it('constraints survive chaining with standard builders', () => {
    const col = d.integer().min(0).max(100).unique().nullable();
    expect(col._meta._minValue).toBe(0);
    expect(col._meta._maxValue).toBe(100);
    expect(col._meta.unique).toBe(true);
    expect(col._meta.nullable).toBe(true);
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
