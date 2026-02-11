import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';
import type { InferColumnType } from '../column';

describe('column type inference', () => {
  it('d.uuid() infers string', () => {
    const col = d.uuid();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.text() infers string', () => {
    const col = d.text();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.varchar(n) infers string', () => {
    const col = d.varchar(255);
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.email() infers string', () => {
    const col = d.email();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.boolean() infers boolean', () => {
    const col = d.boolean();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<boolean>();
  });

  it('d.integer() infers number', () => {
    const col = d.integer();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<number>();
  });

  it('d.bigint() infers bigint', () => {
    const col = d.bigint();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<bigint>();
  });

  it('d.decimal(p, s) infers string (precision-safe)', () => {
    const col = d.decimal(10, 2);
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.real() infers number', () => {
    const col = d.real();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<number>();
  });

  it('d.doublePrecision() infers number', () => {
    const col = d.doublePrecision();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<number>();
  });

  it('d.serial() infers number', () => {
    const col = d.serial();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<number>();
  });

  it('d.timestamp() infers Date', () => {
    const col = d.timestamp();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<Date>();
  });

  it('d.date() infers string', () => {
    const col = d.date();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.time() infers string', () => {
    const col = d.time();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('d.jsonb<T>() infers T', () => {
    interface Settings {
      theme: string;
    }
    const col = d.jsonb<Settings>();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<Settings>();
  });

  it('d.textArray() infers string[]', () => {
    const col = d.textArray();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string[]>();
  });

  it('d.integerArray() infers number[]', () => {
    const col = d.integerArray();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<number[]>();
  });

  it('d.enum(name, values) infers union literal type', () => {
    const col = d.enum('role', ['admin', 'editor']);
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<'admin' | 'editor'>();
  });
});

describe('chainable builder type inference', () => {
  it('.nullable() adds | null to the inferred type', () => {
    const col = d.text().nullable();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string | null>();
  });

  it('.nullable() on boolean adds | null', () => {
    const col = d.boolean().nullable();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<boolean | null>();
  });

  it('.nullable() on integer adds | null', () => {
    const col = d.integer().nullable();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<number | null>();
  });

  it('.nullable() on enum adds | null', () => {
    const col = d.enum('role', ['admin', 'editor']).nullable();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<'admin' | 'editor' | null>();
  });

  it('.primary() does not change the inferred type', () => {
    const col = d.uuid().primary();
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string>();
  });

  it('.default() does not change the inferred type', () => {
    const col = d.boolean().default(true);
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<boolean>();
  });

  it('chaining preserves type correctly', () => {
    const col = d.text().unique().nullable().default('hello');
    expectTypeOf<InferColumnType<typeof col>>().toEqualTypeOf<string | null>();
  });
});

describe('type-level negative tests', () => {
  it('rejects assigning number to uuid column type', () => {
    const col = d.uuid();
    type T = InferColumnType<typeof col>;
    const _valid: T = 'hello';
    // @ts-expect-error -- number is not assignable to string
    const _invalid: T = 42;
    void _valid;
    void _invalid;
  });

  it('rejects assigning string to boolean column type', () => {
    const col = d.boolean();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- string is not assignable to boolean
    const _invalid: T = 'true';
    void _invalid;
  });

  it('rejects assigning string to integer column type', () => {
    const col = d.integer();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- string is not assignable to number
    const _invalid: T = 'hello';
    void _invalid;
  });

  it('rejects assigning number to timestamp column type', () => {
    const col = d.timestamp();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- number is not assignable to Date
    const _invalid: T = 123;
    void _invalid;
  });

  it('rejects invalid enum value', () => {
    const col = d.enum('role', ['admin', 'editor']);
    type T = InferColumnType<typeof col>;
    const _valid: T = 'admin';
    // @ts-expect-error -- 'viewer' is not assignable to 'admin' | 'editor'
    const _invalid: T = 'viewer';
    void _valid;
    void _invalid;
  });

  it('rejects null on non-nullable column', () => {
    const col = d.text();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- null is not assignable to string
    const _invalid: T = null;
    void _invalid;
  });

  it('accepts null on nullable column', () => {
    const col = d.text().nullable();
    type T = InferColumnType<typeof col>;
    const _valid: T = null;
    void _valid;
  });
});
