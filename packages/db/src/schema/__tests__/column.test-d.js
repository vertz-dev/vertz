import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../../d';

describe('column type inference', () => {
  it('d.uuid() infers string', () => {
    const _col = d.uuid();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.text() infers string', () => {
    const _col = d.text();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.varchar(n) infers string', () => {
    const _col = d.varchar(255);
    expectTypeOf().toEqualTypeOf();
  });
  it('d.email() infers string', () => {
    const _col = d.email();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.boolean() infers boolean', () => {
    const _col = d.boolean();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.integer() infers number', () => {
    const _col = d.integer();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.bigint() infers bigint', () => {
    const _col = d.bigint();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.decimal(p, s) infers string (precision-safe)', () => {
    const _col = d.decimal(10, 2);
    expectTypeOf().toEqualTypeOf();
  });
  it('d.real() infers number', () => {
    const _col = d.real();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.doublePrecision() infers number', () => {
    const _col = d.doublePrecision();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.serial() infers number', () => {
    const _col = d.serial();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.timestamp() infers Date', () => {
    const _col = d.timestamp();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.date() infers string', () => {
    const _col = d.date();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.time() infers string', () => {
    const _col = d.time();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.jsonb<T>() infers T', () => {
    const _col = d.jsonb();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.textArray() infers string[]', () => {
    const _col = d.textArray();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.integerArray() infers number[]', () => {
    const _col = d.integerArray();
    expectTypeOf().toEqualTypeOf();
  });
  it('d.enum(name, values) infers union literal type', () => {
    const _col = d.enum('role', ['admin', 'editor']);
    expectTypeOf().toEqualTypeOf();
  });
});
describe('chainable builder type inference', () => {
  it('.nullable() adds | null to the inferred type', () => {
    const _col = d.text().nullable();
    expectTypeOf().toEqualTypeOf();
  });
  it('.nullable() on boolean adds | null', () => {
    const _col = d.boolean().nullable();
    expectTypeOf().toEqualTypeOf();
  });
  it('.nullable() on integer adds | null', () => {
    const _col = d.integer().nullable();
    expectTypeOf().toEqualTypeOf();
  });
  it('.nullable() on enum adds | null', () => {
    const _col = d.enum('role', ['admin', 'editor']).nullable();
    expectTypeOf().toEqualTypeOf();
  });
  it('.primary() does not change the inferred type', () => {
    const _col = d.uuid().primary();
    expectTypeOf().toEqualTypeOf();
  });
  it('.default() does not change the inferred type', () => {
    const _col = d.boolean().default(true);
    expectTypeOf().toEqualTypeOf();
  });
  it('chaining preserves type correctly', () => {
    const _col = d.text().unique().nullable().default('hello');
    expectTypeOf().toEqualTypeOf();
  });
});
describe('type-level negative tests', () => {
  it('rejects assigning number to uuid column type', () => {
    const _col = d.uuid();
    const _valid = 'hello';
    // @ts-expect-error -- number is not assignable to string
    const _invalid = 42;
    void _valid;
    void _invalid;
  });
  it('rejects assigning string to boolean column type', () => {
    const _col = d.boolean();
    // @ts-expect-error -- string is not assignable to boolean
    const _invalid = 'true';
    void _invalid;
  });
  it('rejects assigning string to integer column type', () => {
    const _col = d.integer();
    // @ts-expect-error -- string is not assignable to number
    const _invalid = 'hello';
    void _invalid;
  });
  it('rejects assigning number to timestamp column type', () => {
    const _col = d.timestamp();
    // @ts-expect-error -- number is not assignable to Date
    const _invalid = 123;
    void _invalid;
  });
  it('rejects invalid enum value', () => {
    const _col = d.enum('role', ['admin', 'editor']);
    const _valid = 'admin';
    // @ts-expect-error -- 'viewer' is not assignable to 'admin' | 'editor'
    const _invalid = 'viewer';
    void _valid;
    void _invalid;
  });
  it('rejects null on non-nullable column', () => {
    const _col = d.text();
    // @ts-expect-error -- null is not assignable to string
    const _invalid = null;
    void _invalid;
  });
  it('accepts null on nullable column', () => {
    const _col = d.text().nullable();
    const _valid = null;
    void _valid;
  });
});
describe('d.tenant() type inference', () => {
  it('d.tenant() infers string', () => {
    const orgs = d.table('orgs', { id: d.uuid().primary() });
    const _col = d.tenant(orgs);
    expectTypeOf().toEqualTypeOf();
  });
  it('d.tenant().nullable() infers string | null', () => {
    const orgs = d.table('orgs', { id: d.uuid().primary() });
    const _col = d.tenant(orgs).nullable();
    expectTypeOf().toEqualTypeOf();
  });
});
describe('metadata type-level tracking', () => {
  it('.primary() sets primary to true in metadata type', () => {
    const _col = d.uuid().primary();
    // Type-level assertion: primary should be true
    const _primary = true;
    // @ts-expect-error -- primary is true after .primary(), false should not be assignable
    const _notPrimary = false;
    void _primary;
    void _notPrimary;
  });
  it('.nullable() sets nullable to true in metadata type', () => {
    const _col = d.text().nullable();
    const _nullable = true;
    // @ts-expect-error -- nullable is true after .nullable(), false should not be assignable
    const _notNullable = false;
    void _nullable;
    void _notNullable;
  });
  it('.default() sets hasDefault to true in metadata type', () => {
    const _col = d.boolean().default(true);
    const _hasDefault = true;
    // @ts-expect-error -- hasDefault is true after .default(), false should not be assignable
    const _noDefault = false;
    void _hasDefault;
    void _noDefault;
  });
  it('.sensitive() sets sensitive to true in metadata type', () => {
    const _col = d.email().sensitive();
    const _sensitive = true;
    // @ts-expect-error -- sensitive is true after .sensitive(), false should not be assignable
    const _notSensitive = false;
    void _sensitive;
    void _notSensitive;
  });
  it('.hidden() sets hidden to true in metadata type', () => {
    const _col = d.text().hidden();
    const _hidden = true;
    // @ts-expect-error -- hidden is true after .hidden(), false should not be assignable
    const _notHidden = false;
    void _hidden;
    void _notHidden;
  });
  it('serial has hasDefault true by default', () => {
    const _col = d.serial();
    const _hasDefault = true;
    // @ts-expect-error -- serial has implicit default, false should not be assignable
    const _noDefault = false;
    void _hasDefault;
    void _noDefault;
  });
  it('.unique() sets unique to true in metadata type', () => {
    const _col = d.text().unique();
    const _unique = true;
    // @ts-expect-error -- unique is true after .unique(), false should not be assignable
    const _notUnique = false;
    void _unique;
    void _notUnique;
  });
  it('d.jsonb<T>() with validator preserves type parameter', () => {
    const validator = { parse: (v) => v };
    const _col = d.jsonb({ validator });
    expectTypeOf().toEqualTypeOf();
  });
});
//# sourceMappingURL=column.test-d.js.map
